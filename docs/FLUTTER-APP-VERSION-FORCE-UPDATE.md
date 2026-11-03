# Flutter — app version, build number & force update

**Audience:** Mobile developers (Customer, Restaurant, Driver / StackFood-based apps)  
**Backend:** Gizra Node API (`gizra-backend`)  
**Last updated:** November 2026  

This document explains how to read **bootstrap config**, decide if an **update is required** (version + build), handle **force update** vs optional prompt, and show **maintenance mode**.

---

## 1. Config endpoint

All three apps call the same public config on launch (legacy StackFood shape — **flat JSON**, no `status` / `data` wrapper):

| Route | Notes |
|-------|--------|
| `GET /api/config` | Primary (matches legacy `GET /api/v1/config`) |
| `GET /api/consumer/config` | Same body as above |

Optional header: **`X-localization`** (`en`, `he`, …) for translated legal pages only; version fields are not localized.

**OpenAPI:** `AppConfigurationResponse` in `gizra_customer.openapi.json` (and vendor/driver/admin bundles after `npm run swagger:gen`).

---

## 2. Which JSON keys each app uses

The response contains **all** apps’ thresholds. Each Flutter project must read **only its suffix set**:

| App | Key suffix | Example Android min version key |
|-----|------------|----------------------------------|
| **Customer** | *(none)* | `app_minimum_version_android` |
| **Restaurant (vendor)** | `_restaurant` | `app_minimum_version_android_restaurant` |
| **Driver (deliveryman)** | `_deliveryman` | `app_minimum_version_android_deliveryman` |

Per app, per platform (**Android** and **iOS**), config exposes:

| Field | Type | Example |
|-------|------|---------|
| `app_minimum_version_{platform}{suffix}` | **string** | `"10.0.0"` |
| `app_minimum_build_{platform}{suffix}` | **integer** | `19` |
| `app_force_update_{platform}{suffix}` | **boolean** | `true` |
| `app_url_{platform}{suffix}` | **string**, nullable | Play Store / App Store URL |

Replace `{platform}` with `android` or `ios`.  
Replace `{suffix}` with ``, `_restaurant`, or `_deliveryman` as in the table above.

**Global (all apps):**

| Field | Type | Use |
|-------|------|-----|
| `maintenance_mode` | **boolean** | If `true`, block normal app use |
| `maintenance_message` | **string**, nullable | User-facing message (may be null) |

Admin sets values under **App & Web Settings** (three tabs). Backend stores them in `business_settings` and returns normalized strings (e.g. stored `10` → `"10.0.0"`).

---

## 3. Installed app identity (Flutter)

Use **`package_info_plus`** (or your existing StackFood equivalent):

```dart
final info = await PackageInfo.fromPlatform();
final installedVersion = info.version;       // e.g. "10.0.0" — versionName / CFBundleShortVersionString
final installedBuild = int.tryParse(info.buildNumber) ?? 0;  // e.g. 18 — versionCode / CFBundleVersion
```

Do **not** parse version as `double` from config (old behavior). Config minimum version is always a **string**.

---

## 4. Update required — rules (must match backend)

Implement the same logic as `gizra-backend/src/utils/config/appVersionConfig.ts`:

1. If **installed version** &lt; **minimum version** → **update required**.  
2. If versions are **equal** and **installed build** &lt; **minimum build** → **update required**.  
3. If **installed version** &gt; **minimum version** → **allow app** (ignore build).

**Examples:**

| Installed | Admin minimum | Result |
|-----------|---------------|--------|
| `10.0.0+18` | version `10.0.0`, build `19` | Update required |
| `9.0.0+1` | version `9.0.0`, build `2` | Update required |
| `10.0.1+1` | version `10.0.0`, build `99` | Allowed |

### Version compare (semver-like)

Compare dot-separated numeric segments left to right. Pad mentally to at least three parts when normalizing (backend treats `10` as `10.0.0`).

```dart
int compareAppVersions(String a, String b) {
  List<int> parts(String v) {
    final segments = v.split('.').map((s) => int.tryParse(s.trim()) ?? 0).toList();
    while (segments.length < 3) {
      segments.add(0);
    }
    return segments;
  }

  final pa = parts(a);
  final pb = parts(b);
  final len = [pa.length, pb.length, 3].reduce((x, y) => x > y ? x : y);
  for (var i = 0; i < len; i++) {
    final da = i < pa.length ? pa[i] : 0;
    final db = i < pb.length ? pb[i] : 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

bool isUpdateRequired({
  required String installedVersion,
  required int installedBuild,
  required String minimumVersion,
  required int minimumBuild,
}) {
  final cmp = compareAppVersions(installedVersion, minimumVersion);
  if (cmp < 0) return true;
  if (cmp > 0) return false;
  return installedBuild < minimumBuild;
}
```

---

## 5. Force update vs soft update

When `isUpdateRequired` is **true**:

| `app_force_update_{platform}{suffix}` | UX |
|---------------------------------------|-----|
| **`true`** | **Blocking** screen: no skip, no back into app. Primary action opens store URL. |
| **`false`** | Optional dialog/banner: “Update available” with **Update** and **Later** (product choice). |

When update is **not** required, do not show force-update UI.

Open store with **`app_url_android{suffix}`** or **`app_url_ios{suffix}`** (`url_launcher` / `launchUrl`). If URL is null or empty, show message to update manually from the store.

---

## 6. Recommended launch flow

Run after config fetch (splash / bootstrap), **before** home:

```text
1. Fetch GET /config
2. If maintenance_mode == true
     → Show full-screen maintenance (maintenance_message ?? default copy)
     → Stop (do not proceed to login/home)
3. Read platform-specific min version, min build, force flag, store URL (correct suffix for this app)
4. Read installed version + build from PackageInfo
5. If isUpdateRequired(...)
     → If force flag: blocking update screen
     → Else: optional update prompt (or silent continue — team decision)
6. Else continue normal routing (login / home)
```

**Order:** Maintenance **before** version check so ops can lock everyone out during incidents.

---

## 7. Dart models (config parse)

Extend your existing `ConfigModel` / `SplashModel` (StackFood often has partial fields). Suggested fields for **one** app (customer — no suffix):

```dart
class AppVersionPolicy {
  final String minimumVersion;
  final int minimumBuild;
  final bool forceUpdate;
  final String? storeUrl;

  const AppVersionPolicy({
    required this.minimumVersion,
    required this.minimumBuild,
    required this.forceUpdate,
    this.storeUrl,
  });

  factory AppVersionPolicy.fromConfigJson(
    Map<String, dynamic> json, {
    required String platform, // 'android' | 'ios'
    required String keySuffix, // '' | '_restaurant' | '_deliveryman'
  }) {
    String key(String base) => '$base$keySuffix';
    final minVer = json[key('app_minimum_version_$platform')]?.toString() ?? '0.0.0';
    final minBuild = _asInt(json[key('app_minimum_build_$platform')]);
    final force = _asBool(json[key('app_force_update_$platform')]);
    final url = json[key('app_url_$platform')]?.toString();
    return AppVersionPolicy(
      minimumVersion: minVer.isEmpty ? '0.0.0' : minVer,
      minimumBuild: minBuild,
      forceUpdate: force,
      storeUrl: (url != null && url.isNotEmpty) ? url : null,
    );
  }
}

int _asInt(dynamic v) {
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v?.toString() ?? '') ?? 0;
}

bool _asBool(dynamic v) {
  if (v is bool) return v;
  if (v == 1 || v == '1' || v == true) return true;
  return false;
}
```

**Customer app:** `keySuffix: ''`  
**Restaurant app:** `keySuffix: '_restaurant'`  
**Driver app:** `keySuffix: '_deliveryman'`

Parse maintenance once:

```dart
final maintenanceMode = json['maintenance_mode'] == true || json['maintenance_mode'] == 1;
final maintenanceMessage = json['maintenance_message']?.toString();
```

---

## 8. Platform selection

```dart
import 'dart:io' show Platform;

AppVersionPolicy policyForThisDevice(Map<String, dynamic> config, {required String keySuffix}) {
  final platform = Platform.isIOS ? 'ios' : 'android';
  return AppVersionPolicy.fromConfigJson(config, platform: platform, keySuffix: keySuffix);
}
```

---

## 9. UI checklist

- [ ] Config fetch on cold start (existing splash flow).  
- [ ] Parse **string** minimum version (remove any `double` / `int` parsing from config).  
- [ ] Compare version then build using §4.  
- [ ] Blocking screen when force update + update required.  
- [ ] Store link from `app_url_*` for the correct app suffix.  
- [ ] Maintenance full-screen when `maintenance_mode` is true.  
- [ ] Three separate app codebases: each uses the correct **suffix** only.  

---

## 10. Breaking change from legacy API

Previously, `app_minimum_version_android` (and restaurant/driver variants) could be returned as a **number** (e.g. `10`). They are now **strings** (e.g. `"10.0.0"`).

Update Dart models:

```dart
// Before (avoid)
final minVersion = (json['app_minimum_version_android'] as num?)?.toDouble() ?? 0;

// After
final minVersion = json['app_minimum_version_android']?.toString() ?? '0.0.0';
```

Ship a mobile release that understands strings + build fields before relying on admin build thresholds in production.

---

## 11. QA scenarios

| Step | Action | Expected |
|------|--------|----------|
| 1 | Admin: Customer Android min `10.0.0`, build `19`, force on | Config JSON matches |
| 2 | Install `10.0.0+18` | Blocking update |
| 3 | Install `10.0.0+19` or `10.0.1+1` | Enter app |
| 4 | Admin: force off, min version `99.0.0` | Optional or required prompt per your UX |
| 5 | Admin: maintenance on + message | Maintenance screen, no home |
| 6 | Restaurant / Driver apps | Only suffixed keys affect that app |

Backend unit tests (reference implementation):

```bash
cd gizra-backend && npm run test:app-version-config
```

---

## 12. Backend reference

| Module | Role |
|--------|------|
| `src/utils/config/appConfiguration.ts` | Builds flat config JSON |
| `src/utils/config/appVersionConfig.ts` | Version normalize + `isAppUpdateRequired` |
| `src/utils/admin/businessSetup/service.ts` | Admin save/load |
| Admin UI | `adminPannel/.../AppWebSettingsPage.jsx` |

---

## 13. Contact / deploy

- Deploy **gizra-backend** before mobile relies on string versions and build fields.  
- Re-save app settings in admin once if old DB values were numeric-only.  
- OpenAPI: regenerate after backend pull — `npm run swagger:gen`.
