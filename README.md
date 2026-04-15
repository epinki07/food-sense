# 🧊 Food Sense

> **3er Lugar — Invent for the Planet 2026 (IFTP2026)**

Sistema IoT de monitoreo remoto de refrigeradores con cámaras, sensores y alertas en tiempo real. Food Sense combina hardware y software para resolver un problema cotidiano: prevenir la pérdida de alimentos por fallas en refrigeración.

## 📋 ¿Qué hace?

- **Monitoreo en tiempo real**: Temperatura y humedad de refrigeradores
- **Detección visual**: Cámaras para verificar estado de alimentos
- **Alertas automáticas**: Notificaciones cuando los parámetros salen del rango seguro
- **Dashboard web**: Interfaz para visualizar múltiples unidades
- **Backend REST**: API para comunicación con dispositivos ESP32

## 🛠️ Tech Stack

| Frontend | Backend | Hardware |
|----------|---------|----------|
| HTML/CSS/JavaScript | Node.js | ESP32 |
| Responsive Design | Express.js | Sensores DHT11/DHT22 |
| | JWT Auth | Cámaras IP |

## 🚀 Cómo correrlo localmente

### Prerrequisitos

```bash
node --version  # v16+
npm --version   # v8+
```

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/epinki07/food-sense.git
cd food-sense

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar servidor
npm run dev
```

### Acceder

```
http://localhost:3000
```

## 📁 Estructura del proyecto

```
food-sense/
├── public/          # Frontend estático
├── src/
│   ├── routes/      # Endpoints API
│   ├── middleware/  # Autenticación JWT
│   ├── models/      # Modelos de datos
│   └── utils/       # Helpers
├── views/           # Plantillas HTML
└── .env.example     # Variables de entorno
```

## 🏆 Resultado competitivo

Este proyecto obtuvo el **3er Lugar** en Invent for the Planet 2026 por:

- Combinar hardware y software de forma práctica
- Resolver un problema cotidiano real
- Demostrar integración IoT completa

## 💡 Qué aprendí

- Integración de dispositivos IoT con backend web
- Autenticación JWT en aplicaciones Node.js
- Manejo de streams de datos en tiempo real
- Desarrollo full-stack bajo presión competitiva

## 📸 Demo

> Agregar screenshot del dashboard aquí

## 🤝 Autor

**Diego Ramirez Magaña**  
Estudiante de Ingeniería en Software y Negocios Digitales  
Tecnológico del Software

- 📧 dramirezmagana@gmail.com
- 🔗 [LinkedIn](https://www.linkedin.com/in/diego-ramirez-maga%C3%B1a-b15022298/)
- 🐙 [GitHub](https://github.com/epinki07)

---

**Reconocimiento**: Proyecto desarrollado para Invent for the Planet 2026. Durante el desarrollo de este proyecto, creé de forma paralela **SQAD**, un sistema de control de calidad en Java para gestión de inventarios de alimentos.
