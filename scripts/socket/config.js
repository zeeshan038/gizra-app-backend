function apiBase() {
  const port = process.env.PORT || '3000';
  const localDefault = `http://127.0.0.1:${port}`;
  return (process.env.GIZRA_API_URL || process.env.API_URL || localDefault).replace(/\/$/, '');
}

function token() {
  return process.env.GIZRA_TOKEN || process.env.TOKEN || '';
}

module.exports = { apiBase, token };
