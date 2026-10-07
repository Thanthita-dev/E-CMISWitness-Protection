# A6-E-CMISWitness-Protection

## Knowledge transfer

- **คู่มือเดิน Flow ในแอป**: เปิด `/flow-guide` แล้วเลือกแท็บของผัง drawio (02–11D) หรือเส้นทางแนะนำ กด "เล่นจากจุดนี้" ระบบจะโหลด Mock State สลับบทบาท และเปิดหน้าที่ต้องทำต่อให้
- [`docs/dev-onboarding.md`](docs/dev-onboarding.md): โครงสร้าง prototype, บทบาท, store, Mock State, tests และ gotchas
- [`docs/flow-guide.md`](docs/flow-guide.md): ตารางจับคู่ทุกขั้น WIT ↔ หน้าจอ/บทบาท/Mock State/spec (สร้างจาก `src/flow-guide/flow-map.json` ด้วย `node docs/build-flow-guide.mjs`)

<!-- setup-cicd:development:start -->
## Development

### Prerequisites

- Docker and Docker Compose v2
- Copy `.env.example` to `.env` and fill in real values (`.env` stays gitignored)

### Run locally (hot reload)

```sh
cp .env.example .env
docker compose -f docker-compose.dev.yml up
```

### Run the production shape locally

Pulls the image the CI workflow publishes on push to `mercil-deployment` instead of building from source:

```sh
docker compose -f docker-compose.prod.yml up -d
```

### Build the image directly

```sh
docker build -t ghcr.io/mercil-pacc/a6-e-cmiswitness-protection:local .
```
<!-- setup-cicd:development:end -->
