# Neuro-Guardian Backend

Node/TypeScript backend with Postgres + Prisma + JWT auth, plus role-based doctor/admin APIs.

## Setup

1. Copy `.env.example` to `.env` and fill values.
2. Install dependencies:

```bash
cd server
npm install
```

3. Apply schema migrations:

```bash
npx prisma migrate dev
```

4. Start server:

```bash
npm run dev
```

## Auth API

- `POST /api/auth/register` `{ email, password, role }` where `role` is `DOCTOR` or `ADMIN`
- `POST /api/auth/login` `{ email, password }`
- `POST /api/auth/refresh` `{ refreshToken }`
- `POST /api/auth/logout` `{ refreshToken }`
- `GET /api/auth/me` (Bearer JWT)

`register` and `login` return `{ accessToken, refreshToken, user }` and `user` includes `role`.

## Doctor API (role = DOCTOR)

- `GET /api/doctor/patients/available`
- `GET /api/doctor/patients/mine`
- `POST /api/doctor/patients/:patientId/take`
- `GET /api/doctor/patients/:patientId/detail?window=24h|7d`
- `POST /api/doctor/patients/:patientId/readings` (live emotion probabilities from camera pipeline)

Patient detail includes monitoring timeline, alerts, and data source metadata.

## Admin API (role = ADMIN)

- `GET /api/admin/wards`
- `GET /api/admin/patients/active`
- `POST /api/admin/check-in`
- `POST /api/admin/check-out/:patientId`

Check-in allocates bed/ward and check-out releases bed and archives patient state.

## InfluxDB Integration

The monitoring pipeline reads timeline data from InfluxDB if all variables are configured:

- `INFLUX_URL`
- `INFLUX_TOKEN`
- `INFLUX_ORG`
- `INFLUX_BUCKET`

When InfluxDB is not configured (or has no points for a patient), the API falls back to Postgres readings and then to synthetic demo timeline data.


- docker start influxdb -> ca sa pornesti server influxdb
- http://localhost:8086 -> interfata pt influxdn
- docker ps -> vezi daca containerul influxdb traieste
- docker ps -> vezi containerele ce ruleaza
- docker ps -a -> vezi toate containerele (inclusiv cele oprite)
- docker stop influxdb -> opreste influxdb
- docker start influxdb -> porneste influxdb