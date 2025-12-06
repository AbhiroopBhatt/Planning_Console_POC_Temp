# Installation Fix Guide

## Issue
DuckDB package is failing to compile on Node.js v25.2.1 due to:
1. No pre-built binaries available for Node v25
2. C++ compilation errors when building from source

## Solution

I've made DuckDB **optional** - the application will work without it by falling back to PostgreSQL for the semantic layer.

### Option 1: Install without DuckDB (Recommended for now)

```bash
cd backend
npm install --ignore-scripts
cd ../frontend
npm install
cd ..
```

This will skip the DuckDB compilation and the app will use PostgreSQL for all operations.

### Option 2: Try installing DuckDB separately

If you want to try installing DuckDB later:

```bash
cd backend
npm install duckdb@latest --ignore-scripts
```

Or wait for DuckDB to release a version with Node 25 support.

### Option 3: Use Node.js LTS (v20 or v18)

If you need DuckDB immediately, you can use Node.js LTS:

```bash
# Using nvm
nvm install 20
nvm use 20
npm run install:all
```

## What Changed

1. **DuckDB is now optional** - moved to `optionalDependencies`
2. **PostgreSQL fallback** - The semantic layer will automatically use PostgreSQL if DuckDB is not available
3. **Removed @types/csv-parse** - csv-parse provides its own types

## Verification

After installation, you can verify everything works:

```bash
# Start databases
docker-compose up -d

# Run migrations
cd backend
npm run migrate
npm run seed

# Start the app
npm run dev
```

The application will log whether DuckDB is available or if it's using the PostgreSQL fallback.

