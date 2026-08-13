-- Create local role/db for CarFlow (run as postgres superuser once)
CREATE USER carflow WITH PASSWORD 'carflow' CREATEDB;
CREATE DATABASE carflow OWNER carflow;
GRANT ALL PRIVILEGES ON DATABASE carflow TO carflow;
