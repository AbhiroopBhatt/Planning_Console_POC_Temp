# Planning Console AI - Growth Management Platform

A modern, high-performance platform for promotions planning with advanced analytics and ML capabilities.

## Architecture

- **Frontend**: Next.js 14+ with TypeScript, Tailwind CSS
- **Backend**: Node.js/Express with TypeScript
- **Databases**:
  - PostgreSQL: Master data and transactional data
  - Neo4j Community Edition: Hierarchical relationships
  - DuckDB: Materialized views and fast roll-ups
- **ML**: Python-based models for volume estimation

## Features

- 🎯 Promotions Planning
- 📊 Advanced Analytics & Insights
- 🗓️ Calendar Management
- 💰 Fund Management
- 🔧 Admin Panel:
  - Hierarchy Management
  - ML Model Configuration

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Neo4j Community Edition
- Python 3.9+ (for ML models)

### Installation

```bash
npm run install:all
```

### Environment Setup

Create `.env` files in both `frontend/` and `backend/` directories with appropriate database connections.

### Development

```bash
npm run dev
```

This will start both frontend and backend concurrently.

## Project Structure

```
├── frontend/          # Next.js application
├── backend/           # Express API server
├── db/               # Database schemas and seeds
├── ml/               # ML models and services
└── shared/           # Shared types and utilities
```

