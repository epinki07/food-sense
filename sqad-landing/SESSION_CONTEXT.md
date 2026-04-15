# Contexto guardado (reinicio)

Fecha: 2026-02-28

## Estado actual

- Ya no hay `mailto:` en el flujo de contacto.
- El formulario de contacto no usa destino fijo (`action="#"`).
- El texto viejo **"Quiero solicitar una demostración comercial."** ya fue reemplazado por:
  - **"Me gustaria contactarme con ustedes para probar el producto."**
- Se agregó `cache-busting` al script:
  - `script.js?v=20260228-contact-fix`
  - `script.min.js?v=20260228-contact-fix` en build.
- Se valida que no se envíe al mismo correo remitente (`dramirezmagana@gmail.com`).
- Se bloquea envío si se abre como `file://`.
- Se agregó `sourceUrl` desde frontend y `Origin/Referer` en backend al reenviar a FormSubmit.

## Problema que reportaste

- Aún aparece el error de FormSubmit:
  - "Make sure you open this page through a web server, FormSubmit will not work in pages browsed as HTML files."

## Próximo paso al volver (si sigue fallando)

1. Confirmar que estás abriendo exactamente:
   - `http://localhost:3000/?fresh=contact-final`
2. Forzar recarga:
   - `Cmd + Shift + R`
3. Verificar en consola:
   - `document.querySelector('#contact-form').getAttribute('action')` debe ser `#`
   - `document.scripts[document.scripts.length-1].src` debe incluir `contact-fix`
4. Si persiste, cambiar estrategia a envío directo FormSubmit desde frontend (sin pasar por backend).

