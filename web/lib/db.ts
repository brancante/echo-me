import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

export async function getOrCreateUser(email: string, name?: string, image?: string) {
  const result = await query(
    `INSERT INTO users (email, name, image)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
     SET name = EXCLUDED.name, image = EXCLUDED.image, updated_at = NOW()
     RETURNING id, email, name, image`,
    [email, name, image]
  );
  return result.rows[0];
}

export { pool };
