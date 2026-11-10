// Build-time content. Both language versions ship as complete, static HTML.
export const siteOrigin = 'https://decision.ilyamedve.dev';
export type SiteLanguage = 'en' | 'ru';

const content = {
  en: {
    path: '/', locale: 'en_US', alternateLocale: 'ru_RU',
    title: 'Major Decision — Interstate 60 decision machine',
    description: 'Try the yes-or-no decision machine from Interstate 60. Ask a question, watch the orange ball in live 3D and get a random YES or NO. No sign-up or saved questions.',
    heading: 'The decision machine from Interstate 60',
    intro: 'Major Decision is a fan recreation of the yes-or-no machine seen in Interstate 60. Ask a question and follow the orange ball through the colored pins and spiral to a YES or NO answer.',
    howHeading: 'Ask your question',
    how: 'Type a question in English or Russian, then press ? or Enter. Shift+Enter adds a new line. NEW QUESTION clears the question and starts again. Sound is optional; the machine keeps its English labels from the film.',
    movie: 'Two authored ball trajectories inspired by the film.',
    freestyle: 'A new ball trajectory with simulated collisions on every run. Both modes use live 3D.',
    privacy: 'The answer is random and chosen independently of the ball’s path. Your question stays in this tab’s memory: no account, no saved questions. The optional RANDOM.ORG mode requests random numbers without sending your question.',
    filmHeading: 'See the machine in the film',
    filmIntro: 'Compare the recreation with these moments from the source video on YouTube:',
    tie: 'The question about a tie', competition: 'The question about the painting competition',
    languageLabel: 'Description language',
    imageAlt: 'The blue Major Decision machine with its question field and green-and-purple wordmark.',
    noScript: 'Enable JavaScript to use the decision machine. The project description and film links are available below.',
    source: 'Source code on GitHub',
  },
  ru: {
    path: '/ru/', locale: 'ru_RU', alternateLocale: 'en_US',
    title: 'Major Decision — машина решений из «Трассы 60»',
    description: 'Машина «Да или нет» из фильма «Трасса 60» онлайн. Задайте вопрос, наблюдайте за оранжевым шаром в 3D и получите случайный ответ YES или NO. Без регистрации.',
    heading: 'Машина решений из «Трассы 60»',
    intro: 'Major Decision — фанатская реконструкция машины «Да или нет» из фильма «Трасса 60» (Interstate 60). Задайте вопрос и проследите, как оранжевый шар проходит через цветные штыри и спираль к ответу YES или NO.',
    howHeading: 'Задайте свой вопрос',
    how: 'Введите вопрос на русском или английском, затем нажмите ? или Enter. Shift+Enter добавляет новую строку. NEW QUESTION очищает вопрос и позволяет начать заново. Звук включается по желанию; английские надписи машины сохранены как в фильме.',
    movie: 'Две постановочные траектории шара по мотивам фильма.',
    freestyle: 'Новая траектория с расчётом столкновений при каждом запуске. Оба режима используют живую 3D-сцену.',
    privacy: 'Ответ выбирается случайно, независимо от пути шара. Вопрос остаётся в памяти этой вкладки: без аккаунта и сохранения вопросов. Дополнительный режим RANDOM.ORG запрашивает случайные числа, не отправляя текст вопроса.',
    filmHeading: 'Машина в самом фильме',
    filmIntro: 'Сравните реконструкцию с этими моментами из исходного видео на YouTube:',
    tie: 'Вопрос о галстуке', competition: 'Вопрос о конкурсе картин',
    languageLabel: 'Язык описания',
    imageAlt: 'Синяя машина Major Decision с полем для вопроса и зелёно-фиолетовой эмблемой.',
    noScript: 'Для работы машины решений нужен JavaScript. Описание проекта и ссылки на фрагменты фильма доступны ниже.',
    source: 'Исходный код на GitHub',
  },
} as const;

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value: string) => value.replace(/[&<>"']/g, char => entities[char]);

function head(language: SiteLanguage) {
  const c = content[language];
  const url = siteOrigin + c.path;
  return `<title>${escape(c.title)}</title>
    <meta name="description" content="${escape(c.description)}" />
    <link rel="canonical" href="${url}" />
    <link rel="alternate" hreflang="en" href="${siteOrigin}/" />
    <link rel="alternate" hreflang="ru" href="${siteOrigin}/ru/" />
    <link rel="alternate" hreflang="x-default" href="${siteOrigin}/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Major Decision" />
    <meta property="og:title" content="${escape(c.title)}" />
    <meta property="og:description" content="${escape(c.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:locale" content="${c.locale}" />
    <meta property="og:locale:alternate" content="${c.alternateLocale}" />
    <meta property="og:image" content="${siteOrigin}/social-card.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escape(c.imageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escape(c.title)}" />
    <meta name="twitter:description" content="${escape(c.description)}" />
    <meta name="twitter:image" content="${siteOrigin}/social-card.png" />
    <meta name="twitter:image:alt" content="${escape(c.imageAlt)}" />`;
}

function about(language: SiteLanguage) {
  const c = content[language];
  return `<section class="about-project" aria-labelledby="about-title">
      <nav class="language-nav" aria-label="${c.languageLabel}">
        <a href="/" lang="en" hreflang="en"${language === 'en' ? ' aria-current="page"' : ''}>English</a>
        <a href="/ru/" lang="ru" hreflang="ru"${language === 'ru' ? ' aria-current="page"' : ''}>Русский</a>
      </nav>
      <noscript><p class="script-notice">${c.noScript}</p></noscript>
      <h1 id="about-title">${c.heading}</h1>
      <p class="about-intro">${c.intro}</p>
      <h2>${c.howHeading}</h2>
      <p>${c.how}</p>
      <dl class="mode-descriptions">
        <div><dt lang="en">Movie</dt><dd>${c.movie}</dd></div>
        <div><dt lang="en">Freestyle</dt><dd>${c.freestyle}</dd></div>
      </dl>
      <p>${c.privacy}</p>
      <h2>${c.filmHeading}</h2>
      <p>${c.filmIntro}</p>
      <ul class="film-links">
        <li><a href="https://www.youtube.com/watch?v=RMNhryXGjr8&amp;t=396s" target="_blank" rel="noopener noreferrer">${c.tie} <span>06:36–06:50</span></a></li>
        <li><a href="https://www.youtube.com/watch?v=RMNhryXGjr8&amp;t=515s" target="_blank" rel="noopener noreferrer">${c.competition} <span>08:35–08:50</span></a></li>
      </ul>
      <p class="project-source"><a href="https://github.com/Terro216/major-decision" target="_blank" rel="noopener noreferrer">${c.source}</a></p>
    </section>`;
}

export function renderSitePage(html: string, language: SiteLanguage) {
  function block(source: string, name: string, value: string) {
    const pattern = new RegExp(`<!-- site:${name} -->[\\s\\S]*?<!-- /site:${name} -->`);
    if (!pattern.test(source)) throw new Error(`Missing site:${name} HTML block`);
    return source.replace(pattern, () => `<!-- site:${name} -->\n    ${value}\n    <!-- /site:${name} -->`);
  }
  return block(block(html.replace(/<html lang="[^"]+">/, `<html lang="${language}">`), 'head', head(language)), 'about', about(language));
}

export const robots = `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap.xml\n`;
export const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteOrigin}/</loc></url>
  <url><loc>${siteOrigin}/ru/</loc></url>
</urlset>
`;
