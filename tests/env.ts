import dotenv from 'dotenv';

// values already in the environment win, so DATABASE_URL can point at any local postgres
dotenv.config({ path: '.env.test', quiet: true });
