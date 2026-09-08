"use strict";

// 읽는 순서: 설정 → 상태 → DOM 선택 → 렌더링 → 이벤트 연결 → 초기 실행.
// 상태는 기억하는 값이고, render 함수는 그 값을 화면에 반영한다.
const SETTINGS = {
  githubUsername: "dlckdwls76",
  themeStorageKey: "portfolio-theme",
  headerScrollThreshold: 60,
  topButtonScrollThreshold: 300,
  revealThreshold: 0.2,
  requestTimeoutMs: 10000,
};

const state = {
  theme: "light",
  menuOpen: false,
  projects: { status: "idle", items: [], error: "", language: "all" },
  form: { errors: {}, touched: {}, submitted: false, success: false },
};

const elements = {
  themeButton: document.querySelector("#theme-toggle"),
  menuButton: document.querySelector("#menu-toggle"),
  menu: document.querySelector("#nav-menu"),
  header: document.querySelector("#header"),
  topButton: document.querySelector("#scroll-top"),
  projectList: document.querySelector("#project-list"),
  projectStatus: document.querySelector("#project-status"),
  projectFilters: document.querySelector("#project-filters"),
  retryButton: document.querySelector("#retry-projects"),
  form: document.querySelector("#contact-form"),
  formStatus: document.querySelector("#form-status"),
};
const formFields = [...elements.form.querySelectorAll("input, textarea")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

// 1. 테마: 저장소가 차단되어도 버튼과 페이지는 계속 동작한다.
function readTheme() {
  try {
    const savedTheme = localStorage.getItem(SETTINGS.themeStorageKey);
    return savedTheme === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function renderTheme() {
  const isDark = state.theme === "dark";
  document.documentElement.dataset.theme = state.theme;
  elements.themeButton.setAttribute("aria-pressed", String(isDark));
  elements.themeButton.textContent = isDark ? "라이트 모드" : "다크 모드";
}

function toggleTheme() {
  state.theme = state.theme === "light" ? "dark" : "light";
  renderTheme();
  try {
    localStorage.setItem(SETTINGS.themeStorageKey, state.theme);
  } catch {
    // 저장할 수 없는 환경에서는 현재 탭의 테마만 유지한다.
  }
}

// 2. 탐색: 버튼의 접근성 상태와 실제 메뉴 표시를 같이 바꾼다.
function renderMenu() {
  elements.menu.classList.toggle("active", state.menuOpen);
  elements.menuButton.setAttribute("aria-expanded", String(state.menuOpen));
  elements.menuButton.textContent = state.menuOpen ? "× 닫기" : "☰ 메뉴";
}

function closeMenu() {
  state.menuOpen = false;
  renderMenu();
}

function renderScroll() {
  elements.header.classList.toggle("scrolled", window.scrollY >= SETTINGS.headerScrollThreshold);
  elements.topButton.hidden = window.scrollY < SETTINGS.topButtonScrollThreshold;
}

function initReveal() {
  if (!("IntersectionObserver" in window) || reducedMotion.matches) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      target.classList.add("is-visible");
      target.classList.remove("will-reveal");
      observer.unobserve(target);
    });
  }, { threshold: SETTINGS.revealThreshold });

  document.querySelectorAll(".reveal").forEach((element) => {
    // 화면보다 큰 요소는 임계값에 도달하기 어려우므로 숨기지 않는다.
    if (element.getBoundingClientRect().height > window.innerHeight) return;
    element.classList.add("will-reveal");
    observer.observe(element);
  });
}

// 3. GitHub: 외부 문자열을 HTML에 넣기 전에 태그/속성 문자를 이스케이프한다.
function escapeHTML(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(value).replace(/[&<>"']/g, (character) => entities[character]);
}

function createProjectCard(project) {
  const { name, description, language, stargazers_count, updated_at } = project;
  // 외부 html_url을 그대로 쓰지 않고, 고정한 GitHub 주소로 링크를 만든다.
  const url = `https://github.com/${SETTINGS.githubUsername}/${encodeURIComponent(name)}`;
  const date = new Date(updated_at);
  const updated = Number.isNaN(date.getTime()) ? "날짜 정보 없음" : date.toLocaleDateString("ko-KR");
  return `
    <article class="project-card">
      <h3><a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHTML(name)} ↗</a></h3>
      <p>${escapeHTML(description || "저장소에서 코드와 학습 기록을 확인해보세요.")}</p>
      <div class="project-meta">
        <span>${escapeHTML(language || "언어 미지정")}</span>
        <span>별 ${Number(stargazers_count) || 0}개</span>
        <span>업데이트 ${updated}</span>
      </div>
    </article>`;
}

// 기본 언어와 실제 저장소의 언어를 합친다. Set은 중복을 제거한다.
function renderProjectFilters() {
  const languages = [...new Set([
    "JavaScript", "HTML", "CSS", "Python",
    ...state.projects.items.map(({ language }) => language || "언어 미지정"),
  ])];
  elements.projectFilters.innerHTML = ["all", ...languages].map((language) => `
    <button class="filter-button" type="button" data-language="${escapeHTML(language)}"
      aria-controls="project-list" aria-pressed="${language === state.projects.language}">
      ${language === "all" ? "전체" : escapeHTML(language)}
    </button>`).join("");
}

function renderProjects() {
  const { status, items, error, language } = state.projects;
  // filter는 원본 items를 바꾸지 않고 조건에 맞는 새 배열을 반환한다.
  const filteredItems = items.filter((project) =>
    language === "all" || (project.language || "언어 미지정") === language
  );
  const messages = {
    idle: "",
    loading: "프로젝트를 불러오는 중...",
    success: filteredItems.length > 0
      ? `${language === "all" ? "전체" : language}: ${items.length}개 중 ${filteredItems.length}개의 저장소를 표시합니다.`
      : `${language}에 해당하는 프로젝트가 없습니다. 전체 또는 다른 언어를 선택해주세요.`,
    empty: "표시할 프로젝트가 없습니다.",
    error: `프로젝트를 불러올 수 없습니다. ${error}`,
  };
  elements.projectStatus.textContent = messages[status];
  elements.projectStatus.classList.toggle("error", status === "error");
  elements.projectList.setAttribute("aria-busy", String(status === "loading"));
  elements.retryButton.hidden = status !== "error";
  elements.projectFilters.hidden = status !== "success";
  // 버튼을 다시 만들지 않고 선택 표시만 바꿔 키보드 초점을 유지한다.
  elements.projectFilters.querySelectorAll("button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.language === language));
  });
  elements.projectList.innerHTML = status === "success" ? filteredItems.map(createProjectCard).join("") : "";
}

async function loadProjects() {
  if (state.projects.status === "loading") return;
  state.projects = { status: "loading", items: [], error: "", language: "all" };
  renderProjects();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SETTINGS.requestTimeoutMs);
  try {
    // 학습 범위를 작게 유지: 최근 업데이트 순으로 최대 12개만 요청한다.
    const url = `https://api.github.com/users/${SETTINGS.githubUsername}/repos?sort=updated&direction=desc&per_page=12`;
    const response = await fetch(url, { signal: controller.signal });
    // fetch는 403/404/500에서도 resolve되므로 ok를 직접 확인해야 한다.
    if (!response.ok) {
      if (response.status === 403 || response.status === 429) {
        throw new Error("GitHub 요청이 제한되었습니다. 잠시 후 다시 시도해주세요.");
      }
      throw new Error(`GitHub 응답 오류 (${response.status})`);
    }
    const projects = await response.json();
    if (!Array.isArray(projects) || !projects.every((project) => project && typeof project.name === "string")) {
      throw new Error("저장소 데이터 형식을 확인할 수 없습니다.");
    }
    state.projects.items = projects;
    state.projects.status = projects.length > 0 ? "success" : "empty";
    renderProjectFilters();
  } catch (error) {
    state.projects.status = "error";
    state.projects.error = error.name === "AbortError"
      ? "응답 시간이 초과되었습니다. 다시 시도해주세요."
      : error instanceof TypeError
        ? "인터넷 연결을 확인하고 다시 시도해주세요."
        : error.message;
  } finally {
    clearTimeout(timeout);
    renderProjects();
  }
}

// 4. 폼: 검증(값 → 오류)과 렌더링(오류 → 화면)을 분리한다.
function validateField(field) {
  if (!field.value.trim()) return "필수 입력 항목입니다.";
  if (field.name === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim())) {
    return "이메일 형식을 확인해주세요. 예: name@example.com";
  }
  return "";
}

function renderForm() {
  formFields.forEach((field) => {
    const showError = state.form.submitted || state.form.touched[field.name];
    const error = showError ? state.form.errors[field.name] || "" : "";
    document.querySelector(`#${field.id}-error`).textContent = error;
    field.setAttribute("aria-invalid", String(Boolean(error)));
  });
  elements.formStatus.textContent = state.form.success
    ? "입력 확인이 완료되었습니다. 데모이므로 메시지는 실제로 전송되지 않았습니다."
    : "";
}

function handleSubmit(event) {
  event.preventDefault();
  state.form.submitted = true;
  formFields.forEach((field) => {
    state.form.errors[field.name] = validateField(field);
  });
  state.form.success = Object.values(state.form.errors).every((error) => error === "");
  renderForm();
  if (!state.form.success) {
    formFields.find((field) => state.form.errors[field.name]).focus();
  }
}

// 5. 이벤트 연결: HTML에는 onclick/onsubmit을 쓰지 않는다.
elements.themeButton.addEventListener("click", toggleTheme);
elements.menuButton.addEventListener("click", () => {
  state.menuOpen = !state.menuOpen;
  renderMenu();
});
elements.menu.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", closeMenu);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.menuOpen) {
    closeMenu();
    elements.menuButton.focus();
  }
});
window.matchMedia("(min-width: 768px)").addEventListener("change", closeMenu);
window.addEventListener("scroll", renderScroll, { passive: true });
elements.topButton.addEventListener("click", () => {
  // 스크롤 후 숨겨지는 버튼 대신 첫 탐색 링크로 키보드 초점을 이동한다.
  document.querySelector(".logo").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: reducedMotion.matches ? "auto" : "smooth" });
});
elements.retryButton.addEventListener("click", () => {
  // 다시 시도 버튼이 사라져도 키보드 초점이 유실되지 않도록 제목으로 옮긴다.
  const heading = document.querySelector("#projects-title");
  heading.setAttribute("tabindex", "-1");
  heading.focus({ preventScroll: true });
  loadProjects();
});
elements.form.addEventListener("submit", handleSubmit);
// 필터 클릭 → 상태 변경 → filter로 선택 → map으로 카드 렌더링.
elements.projectFilters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-language]");
  if (!button || !elements.projectFilters.contains(button)) return;
  state.projects.language = button.dataset.language;
  renderProjects();
});
formFields.forEach((field) => {
  field.addEventListener("input", () => {
    state.form.touched[field.name] = true;
    state.form.errors[field.name] = validateField(field);
    state.form.success = false;
    renderForm();
  });
});

// 6. 초기 실행: defer 덕분에 HTML 요소를 모두 읽은 다음 실행된다.
state.theme = readTheme();
renderTheme();
renderMenu();
renderScroll();
renderForm();
initReveal();
document.querySelector("#year").textContent = new Date().getFullYear();
loadProjects();
