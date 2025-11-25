// PuppeteerPDF.js - CON CACHE PERSONALIZADA
import puppeteer from 'puppeteer';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('=== INICIANDO GENERACIÓN DE PDF ===');
      
      // Crear carpeta de cache en tu proyecto
      const cacheDir = join(process.cwd(), 'puppeteer-cache');
      if (!existsSync(cacheDir)) {
        mkdirSync(cacheDir, { recursive: true });
      }
      
      console.log('Usando carpeta de cache:', cacheDir);

      // Configuración con cache personalizada
      const browserOptions = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions'
        ],
        // Configurar variables de entorno para la cache
        env: {
          ...process.env,
          PUPPETEER_CACHE_DIR: cacheDir
        },
        userDataDir: join(cacheDir, 'user-data'),
        timeout: 60000
      };

      console.log('Lanzando Puppeteer con cache personalizada...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Puppeteer lanzado exitosamente');

      const page = await browser.newPage();
      page.setDefaultTimeout(30000);

      console.log('Cargando contenido HTML...');
      await page.setContent(htmlContent, {
        waitUntil: 'networkidle0',
        timeout: 15000
      });

      console.log('Esperando renderizado...');
      await page.waitForTimeout(1000);

      console.log('Generando PDF...');
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      console.log(`PDF generado exitosamente - ${pdfBuffer.length} bytes`);
      return pdfBuffer;

    } catch (error) {
      console.error('ERROR en generatePDF:', error.message);
      
      if (error.message.includes('Could not find')) {
        console.log('Forzando instalación local...');
        throw new Error('Ejecuta: npx puppeteer install --cache-dir ./puppeteer-cache');
      }
      throw error;
    } finally {
      if (browser) {
        await browser.close().catch(console.error);
      }
    }
  }
}

export default PuppeteerPDF;