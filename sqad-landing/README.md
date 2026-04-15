# Food Sense Landing + Backend

## Ejecutar en desarrollo

```bash
npm run dev
```

Abre: `http://localhost:3000`

El servidor carga automáticamente variables desde `.env` (si existe).

## Credenciales demo

- Usuario: `diegopro`
- Contraseña: `123456`

Nota: el acceso usa sesión en servidor. El modo demo local solo se habilita en `file://` o `localhost`.

## Build de producción

```bash
npm run build
npm start
```

- `build` genera `dist/`
- Incluye bundles minificados y compresión `gzip`/`brotli`.

## Pruebas

```bash
npm test
```

## Endpoints principales

- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/esp32/data?limit=50`
- `GET /api/esp32/history?sensor=<id>&limit=10`
- `POST /api/esp32/submit`
- Compatibilidad Flask: `GET /data`, `GET /history`, `POST /submit`
- `GET /api/esp32/stream?url=<endpoint>&interval=2500`
- `GET /api/image?src=<remote-url>`
- `POST /api/contact`
- `POST /api/metrics`
- `GET /api/metrics/summary`

## ESP32 en tiempo real (recomendado)

Food Sense espera que tu ESP32 exponga un endpoint HTTP con lectura de sensores, por ejemplo:

- `http://192.168.1.60/sensors`
- `http://esp32.local/sensors`

Formato JSON recomendado:

```json
{
  "temperature": 4.8,
  "humidity": 67.2,
  "co2": 420,
  "door_state": "cerrada",
  "timestamp": "2026-02-28T18:45:00Z"
}
```

También se aceptan respuestas de texto tipo:

```txt
temp=4.8; humidity=67.2; mq135=420; door=closed
```

## Variables de entorno útiles

- `SQAD_USER`: usuario de login (default `diegopro`)
- `SQAD_PASSWORD_HASH`: hash `scrypt` en hexadecimal
- `SQAD_PASSWORD_SALT`: salt para validar contraseña
- `SQAD_ESP32_ALLOWLIST`: hosts permitidos para stream ESP32 (separados por coma)
- `SQAD_ESP32_ALLOW_PUBLIC=1`: permite hosts públicos para stream ESP32
- `SQAD_ESP32_ALLOW_PRIVATE=0|1`: controla acceso a IP privadas (default `1`)
- `SQAD_ESP32_ALLOW_LOOPBACK=0|1`: loopback en producción default `0`
- `SQAD_ESP32_ALLOW_LINK_LOCAL=0|1`: controla link-local (default `1`)
- `SQAD_CONTACT_PROVIDER=mailersend|formsubmit|smtp|webhook`: proveedor de envío de contacto
- `SQAD_CONTACT_PROVIDER_FALLBACK=smtp|formsubmit|webhook`: proveedor de respaldo si falla el principal
- `SQAD_CONTACT_TO`: correo destino del formulario (default `dramirezmagana@gmail.com`)
- `SQAD_CONTACT_FROM`: remitente configurado para el envío (default `dramirezmagana@gmail.com`)
- `SQAD_CONTACT_FORMSUBMIT_BASE`: base de FormSubmit (default `https://formsubmit.co/ajax`)
- `SQAD_CONTACT_WEBHOOK`: URL webhook si `SQAD_CONTACT_PROVIDER=webhook`
- `SQAD_CONTACT_CAPTCHA=0|1`: envía bandera de captcha al proveedor (default `0` para flujo backend)
- `SQAD_CONTACT_MAILERSEND_TOKEN`: API token de MailerSend si `SQAD_CONTACT_PROVIDER=mailersend`
- `SQAD_CONTACT_MAILERSEND_BASE`: base API de MailerSend (default `https://api.mailersend.com/v1`)
- `SQAD_CONTACT_MAILERSEND_FROM`: remitente validado en MailerSend (default `SQAD_CONTACT_FROM`).
  Debe ser un correo en dominio propio autenticado (SPF/DKIM), no Gmail/Outlook/Yahoo.
- `SQAD_CONTACT_MAILERSEND_FROM_NAME`: nombre visible del remitente (default `Food Sense`)
- `SQAD_CONTACT_MAILERSEND_TO`: destinatario fijo de leads en MailerSend (default `SQAD_CONTACT_TO`)
- `SQAD_CONTACT_SMTP_HOST`: host SMTP (ej. `smtp.tudominio.com`)
- `SQAD_CONTACT_SMTP_PORT`: puerto SMTP (ej. `587` o `465`)
- `SQAD_CONTACT_SMTP_SECURE=0|1`: `1` para SMTPS directo (normalmente `465`)
- `SQAD_CONTACT_SMTP_REQUIRE_TLS=0|1`: exige STARTTLS (default `1`)
- `SQAD_CONTACT_SMTP_USER`: usuario SMTP
- `SQAD_CONTACT_SMTP_PASS`: contraseña o app password SMTP
- `SQAD_CONTACT_SMTP_FROM`: correo remitente usado en SMTP
- `SQAD_CONTACT_SMTP_TO`: correo destino fijo para solicitudes comerciales
- `SQAD_ESP32_DB_HOST`: host MySQL para historial ESP32 (default `localhost`)
- `SQAD_ESP32_DB_PORT`: puerto MySQL (default `3307`)
- `SQAD_ESP32_DB_USER`: usuario MySQL (default `esp32`)
- `SQAD_ESP32_DB_PASSWORD`: contraseña MySQL (default `esp32pass`)
- `SQAD_ESP32_DB_NAME`: base de datos MySQL (default `sistema_refrigeradores`)
- `SQAD_ESP32_DB_TABLE`: tabla de mediciones (default `mediciones`)
