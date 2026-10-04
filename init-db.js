const fs = require('fs');
const pool = require('./db');

(async () => {
  try {
    const sql = fs.readFileSync('./schema.sql', 'utf8');
    await pool.query(sql);
    console.log('✅ Tables created');

    const { rows } = await pool.query('SELECT COUNT(*) FROM products');
    if (parseInt(rows[0].count) === 0) {
      console.log('Seeding products…');
      await require('./seed')();
    }
    console.log('✅ Database ready');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();