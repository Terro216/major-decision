import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { renderSitePage, robots, sitemap } from './src/siteContent.ts';

function staticSitePages(): Plugin {
  return {
    name: 'major-decision-static-pages',
    enforce: 'post',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const pathname = new URL(context.originalUrl || context.path, 'http://localhost').pathname;
        return renderSitePage(html, pathname === '/ru/' || pathname === '/ru/index.html' ? 'ru' : 'en');
      },
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const index = bundle['index.html'];
        if (!index || index.type !== 'asset' || typeof index.source !== 'string') throw new Error('Missing built index.html');
        this.emitFile({ type: 'asset', fileName: 'ru/index.html', source: renderSitePage(index.source, 'ru') });
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), staticSitePages()],
  build: { target: 'es2022' },
});
