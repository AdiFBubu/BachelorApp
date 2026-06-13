Cum rulezi testele white-box:

npx jest --runTestsByPath src/__tests__/monitoring.deriveProlongedAlert.whitebox.test.ts

Depth-first (integrare pe pasi):

Step 1 - Entry Point & Security:
Focus: App + Route + Middleware (request la /readings trece de auth si ajunge la usa logicii).
Componente simulate: Controller (stub).
npx jest --runTestsByPath src/__tests__/integration.topdown.step1.controller.unit.test.ts

Step 2 - Orchestrare API:
Focus: integrarea Controller-ului (preia date din request si apeleaza business boundary).
Componente simulate: Service (stub).
npx jest --runTestsByPath src/__tests__/integration.topdown.step2.route-controller.integration.test.ts

Step 3 - Business Logic:
Focus: integrarea Service-ului real (calcule scor + logica alerte).
Componente simulate: Prisma + Influx (mocks).
npx jest --runTestsByPath src/__tests__/integration.topdown.step3.route-controller-service.integration.test.ts

Step 4 - Data Access:
Focus: integrarea persistentei relationale (Prisma) si verificarea scrierii corecte.
Componente simulate: Influx (mock).
Rulare: Postgres in container.
npx jest --runTestsByPath src/__tests__/integration.topdown.step4.route-controller-service-prisma-fake.integration.test.ts

Step 5 - Time-series / Telemetry:
Focus: fluxul complet de telemetrie, inclusiv scriere/citire timeline prin boundary-ul Influx.
Componente simulate: fara (flux complet cu containere Postgres + InfluxDB).
npx jest --runTestsByPath src/__tests__/integration.topdown.step5.route-controller-service-prisma-influx-fakes.integration.test.ts

Step 6 - System E2E (Black-box):
Focus: validare end-to-end la nivel de sistem prin API-uri reale (Auth + Admin + Doctor) folosind tehnici black-box ECP, BVA si State Transition.
Componente simulate: fara (HTTP real + Postgres real in container).
npx jest --runTestsByPath src/__tests__/system.e2e.step6.blackbox.ecp-bva-state.test.ts

IMPORTANT pentru Step 4 si Step 5 (containere):
$env:RUN_CONTAINER_INTEGRATION='1'

Exemplu rulare doar Step 4:
npx jest --runTestsByPath src/__tests__/integration.topdown.step4.route-controller-service-prisma-fake.integration.test.ts

Exemplu rulare doar Step 5:
npx jest --runTestsByPath src/__tests__/integration.topdown.step5.route-controller-service-prisma-influx-fakes.integration.test.ts

Reset variabila:
Remove-Item Env:RUN_CONTAINER_INTEGRATION

Toate cele 3 step-uri dintr-un foc:
npx jest --runTestsByPath src/__tests__/integration.topdown.step1.controller.unit.test.ts src/__tests__/integration.topdown.step2.route-controller.integration.test.ts src/__tests__/integration.topdown.step3.route-controller-service.integration.test.ts

Toate cele 6 step-uri dintr-un foc:
$env:RUN_CONTAINER_INTEGRATION='1'
npx jest --runTestsByPath src/__tests__/integration.topdown.step1.controller.unit.test.ts src/__tests__/integration.topdown.step2.route-controller.integration.test.ts src/__tests__/integration.topdown.step3.route-controller-service.integration.test.ts src/__tests__/integration.topdown.step4.route-controller-service-prisma-fake.integration.test.ts src/__tests__/integration.topdown.step5.route-controller-service-prisma-influx-fakes.integration.test.ts src/__tests__/system.e2e.step6.blackbox.ecp-bva-state.test.ts
Remove-Item Env:RUN_CONTAINER_INTEGRATION

rulare teste integrare cu containere:

RUN_CONTAINER_INTEGRATION=1 ./node_modules/.bin/jest src/__tests__/integration.topdown.step4.route-controller-service-prisma-fake.integration.test.ts

RUN_CONTAINER_INTEGRATION=1 ./node_modules/.bin/jest src/__tests__/integration.topdown.step5.route-controller-service-prisma-influx-fakes.integration.test.ts

RUN_CONTAINER_INTEGRATION=1 ./node_modules/.bin/jest src/__tests__/system.e2e.step6.blackbox.ecp-bva-state.test.ts

=====

# run up until step 3
npm test

# run step 4 only
RUN_CONTAINER_INTEGRATION=1 npx jest src/__tests__/integration.topdown.step4.route-controller-service-prisma-fake.integration.test.ts --runInBand

# run step 5 only
RUN_CONTAINER_INTEGRATION=1 npx jest src/__tests__/integration.topdown.step5.route-controller-service-prisma-influx-fakes.integration.test.ts --runInBand
