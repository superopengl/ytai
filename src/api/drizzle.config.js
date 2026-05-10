export default {
  dialect: 'postgresql',
  schema: './src/api/db/schema.js',
  out: './src/api/drizzle',
  dbCredentials: {
    url: process.env.YTAI_DATABASE_URL
  }
};
