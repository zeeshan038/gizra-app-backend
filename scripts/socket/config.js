function apiBase() {
  return (process.env.GIZRA_API_URL || process.env.API_URL || 'http://127.0.0.1:3002').replace(
    /\/$/,
    ''
  );
}

function token() {
  return process.env.GIZRA_TOKEN || process.env.TOKEN || '';
}

module.exports = { apiBase, token };
