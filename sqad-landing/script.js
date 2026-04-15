const portfolioData = {
  identity: {
    name: "Diego Ramírez Magaña",
    email: "dramirezmagana@gmail.com",
    location: "Mérida, Yucatán"
  },
  highlights: [
    "Backend y APIs con criterio de producto",
    "Automatización para reducir fricción operativa",
    "MVPs funcionales antes que presentaciones vacías"
  ],
  metrics: [
    {
      value: "Backend + producto",
      label: "Diseño técnico con foco en utilidad real y velocidad de iteración."
    },
    {
      value: "Datos y operación",
      label: "Prefiero sistemas que hagan visible lo importante y ayuden a decidir."
    },
    {
      value: "Entrega usable",
      label: "Primero una versión clara y viva; luego endurecer detalles sin frenar."
    }
  ],
  projects: [
    {
      kicker: "Monitoreo IoT",
      title: "Food Sense",
      summary:
        "Dashboard y backend para monitoreo de cadena fría con captura de telemetría, historial operativo y flujo comercial integrado.",
      outcome: "Node.js · MySQL · ESP32 · tiempo real",
      accent: "azure",
      visual: "dashboard"
    },
    {
      kicker: "Automatización",
      title: "Flujos documentales",
      summary:
        "Exploración de herramientas para ordenar información, reducir pasos manuales y volver trazables procesos repetitivos.",
      outcome: "Python · parsing · lógica de negocio",
      accent: "amber",
      visual: "mobile"
    },
    {
      kicker: "Operación interna",
      title: "Sistemas de inventario y datos",
      summary:
        "Interfaces ligeras para registrar, consultar y entender información operativa sin depender de hojas dispersas.",
      outcome: "Java · SQL · formularios · reportes",
      accent: "slate",
      visual: "system"
    }
  ],
  skills: [
    { mark: "PY", name: "Python", detail: "automatización y scripting" },
    { mark: "JS", name: "JavaScript", detail: "interfaces y lógica web" },
    { mark: "SQL", name: "SQL / MySQL", detail: "datos operativos y consulta" },
    { mark: "JAVA", name: "Java", detail: "fundamentos de backend y escritorio" },
    { mark: "API", name: "REST APIs", detail: "servicios e integraciones" },
    { mark: "UX", name: "Producto digital", detail: "claridad, criterio y priorización" }
  ],
  focus: [
    {
      title: "Pienso en negocio, no solo en código",
      text: "Busco soluciones que ahorren tiempo, reduzcan confusión y se puedan explicar fácil a quien opera el sistema."
    },
    {
      title: "Construyo rápido, pero con base",
      text: "Me gusta sacar una primera versión usable y luego endurecer estructura, performance y detalle con datos reales."
    },
    {
      title: "Me interesan sistemas conectados",
      text: "Backends, dashboards, ingestión de datos, automatización y herramientas internas con impacto práctico."
    }
  ],
  story: [
    "Trabajo en la intersección entre software, operación y producto digital. Me interesa que una idea no se quede en wireframe, sino que termine convertida en una herramienta concreta.",
    "No me atrae el código por sí solo. Me atrae cuando sirve para ordenar procesos, dar visibilidad a los datos y ayudar a alguien a trabajar mejor.",
    "La dirección que busco en mis proyectos es clara: construir sistemas sobrios, útiles y visualmente cuidados, con suficiente ambición para crecer sin perder simplicidad."
  ],
  timeline: [
    {
      title: "Base técnica",
      text: "Java, SQL y fundamentos de arquitectura para sistemas con lógica de negocio y persistencia de datos."
    },
    {
      title: "Expansión web",
      text: "Landing pages, backends Node.js, formularios, APIs y experiencias más cercanas al usuario final."
    },
    {
      title: "Interés actual",
      text: "Automatización, software útil para operación y productos digitales construidos con criterio comercial."
    }
  ]
};

const byId = (id) => document.getElementById(id);

const renderHeroHighlights = () => {
  const container = byId("hero-highlights");
  if (!container) {
    return;
  }
  container.innerHTML = portfolioData.highlights
    .map((item) => `<li>${item}</li>`)
    .join("");
};

const buildProjectVisual = (visual) => {
  if (visual === "mobile") {
    return `
      <div class="mock-phone">
        <div class="mock-phone-shell">
          <div class="mock-phone-screen">
            <div class="mock-phone-notch"></div>
            <div class="mock-phone-content">
              <strong></strong>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (visual === "system") {
    return `
      <div class="mock-system">
        <div class="mock-system-laptop">
          <div class="mock-system-screen">
            <div class="mock-system-grid">
              <span></span><span></span><span></span><span></span><span></span>
            </div>
          </div>
          <div class="mock-system-base"></div>
          <div class="mock-system-phone"></div>
        </div>
      </div>
    `;
  }

  return `
    <div class="mock-browser">
      <div class="mock-browser-dots">
        <span></span><span></span><span></span>
      </div>
      <div class="mock-browser-panels">
        <div class="mock-browser-main"></div>
        <div class="mock-browser-side"></div>
      </div>
      <div class="mock-side-card"></div>
    </div>
  `;
};

const renderProjects = () => {
  const container = byId("featured-projects");
  if (!container) {
    return;
  }

  container.innerHTML = portfolioData.projects
    .map((project, index) => {
      return `
        <article class="project-card reveal" data-accent="${project.accent}" style="transition-delay:${index * 70}ms">
          <div class="project-visual" aria-hidden="true">
            ${buildProjectVisual(project.visual)}
          </div>
          <div class="project-content">
            <p class="project-kicker">${project.kicker}</p>
            <h3>${project.title}</h3>
            <p>${project.summary}</p>
            <span class="project-outcome">${project.outcome}</span>
          </div>
        </article>
      `;
    })
    .join("");
};

const renderMetrics = () => {
  const container = byId("hero-metrics");
  if (!container) {
    return;
  }

  container.innerHTML = portfolioData.metrics
    .map((metric) => {
      return `
        <article class="metric-card reveal">
          <span class="metric-value">${metric.value}</span>
          <p>${metric.label}</p>
        </article>
      `;
    })
    .join("");
};

const renderSkills = () => {
  const container = byId("skills-grid");
  if (!container) {
    return;
  }

  container.innerHTML = portfolioData.skills
    .map((skill) => {
      return `
        <article class="skill-card reveal">
          <span class="skill-mark">${skill.mark}</span>
          <div>
            <h3>${skill.name}</h3>
            <p>${skill.detail}</p>
          </div>
        </article>
      `;
    })
    .join("");
};

const renderFocus = () => {
  const container = byId("focus-grid");
  if (!container) {
    return;
  }

  container.innerHTML = portfolioData.focus
    .map((item) => {
      return `
        <article class="focus-card reveal">
          <h3>${item.title}</h3>
          <p>${item.text}</p>
        </article>
      `;
    })
    .join("");
};

const renderStory = () => {
  const storyContainer = byId("story-copy");
  const timelineContainer = byId("timeline-grid");

  if (storyContainer) {
    storyContainer.innerHTML = portfolioData.story.map((paragraph) => `<p>${paragraph}</p>`).join("");
  }

  if (timelineContainer) {
    timelineContainer.innerHTML = portfolioData.timeline
      .map((item) => {
        return `
          <article class="timeline-item reveal">
            <h3>${item.title}</h3>
            <p>${item.text}</p>
          </article>
        `;
      })
      .join("");
  }
};

const observeReveal = () => {
  const items = document.querySelectorAll(".reveal");
  if (!items.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => {
      item.dataset.inview = "true";
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.dataset.inview = "true";
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
  );

  items.forEach((item) => observer.observe(item));
};

const setupNavTracking = () => {
  const sections = Array.from(document.querySelectorAll("main section[id]"));
  const links = Array.from(document.querySelectorAll(".nav-link"));

  if (!sections.length || !links.length || !("IntersectionObserver" in window)) {
    return;
  }

  const setActive = (id) => {
    links.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`);
    });
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (visible) {
        setActive(visible.target.id);
      }
    },
    {
      threshold: [0.32, 0.5, 0.68],
      rootMargin: "-18% 0px -45% 0px"
    }
  );

  sections.forEach((section) => observer.observe(section));
};

const setupSmoothScroll = () => {
  const links = document.querySelectorAll("[data-scroll-link]");
  if (!links.length) {
    return;
  }

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = link.getAttribute("href") || "";
      if (!href.startsWith("#")) {
        return;
      }

      const target = document.querySelector(href);
      if (!target) {
        return;
      }

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      history.replaceState({}, "", href);
    });
  });
};

const pushMetric = (name, value, detail = {}) => {
  const payload = JSON.stringify({
    name,
    value,
    detail,
    path: window.location.pathname,
    ts: Date.now()
  });

  if (navigator.sendBeacon) {
    navigator.sendBeacon("/api/metrics", new Blob([payload], { type: "application/json" }));
    return;
  }

  fetch("/api/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true
  }).catch(() => {});
};

const setupContactForm = () => {
  const form = byId("contact-form");
  const status = byId("contact-status");
  const submitButton = form?.querySelector('button[type="submit"]');

  if (!form || !status || !submitButton) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.dataset.state = "";

    if (!form.reportValidity()) {
      return;
    }

    submitButton.disabled = true;
    status.textContent = "Enviando mensaje...";

    const payload = {
      name: byId("contact-name")?.value.trim() || "",
      email: byId("contact-email")?.value.trim() || "",
      store: byId("contact-store")?.value.trim() || "",
      message: byId("contact-message")?.value.trim() || "",
      consent: Boolean(byId("contact-consent")?.checked),
      source: "portfolio-diego",
      sourceUrl: window.location.href
    };

    try {
      const response = await fetch(form.dataset.endpoint || "/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || `No fue posible enviar el mensaje (${response.status}).`);
      }

      form.reset();
      status.dataset.state = "success";
      status.textContent = "Mensaje enviado. Te responderé por correo lo antes posible.";
      pushMetric("contact_submit", 1, { source: payload.source });
    } catch (error) {
      status.dataset.state = "error";
      status.textContent = error.message || "Ocurrió un error al enviar el mensaje.";
    } finally {
      submitButton.disabled = false;
    }
  });
};

const setCurrentYear = () => {
  const year = byId("current-year");
  if (year) {
    year.textContent = String(new Date().getFullYear());
  }
};

const init = () => {
  renderHeroHighlights();
  renderProjects();
  renderMetrics();
  renderSkills();
  renderFocus();
  renderStory();
  setupSmoothScroll();
  setupNavTracking();
  observeReveal();
  setupContactForm();
  setCurrentYear();
  pushMetric("page_view", 1, { sectionCount: document.querySelectorAll("main section[id]").length });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
