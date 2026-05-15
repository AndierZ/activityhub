-- Migration: 001_enable_extensions.sql
-- Enable the uuid-ossp extension for generating UUIDs

create extension if not exists "uuid-ossp";
