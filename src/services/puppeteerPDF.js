import puppeteer from 'puppeteer';
import fs from 'fs';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    try {
      console.log('Iniciando generación de PDF con Microsoft Edge...');

      // Buscar Microsoft Edge en las rutas comunes de Windows
      const edgePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env.PROGRAMFILES + '\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env['PROGRAMFILES(X86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe'
      ];

      let edgePath = null;
      for (const path of edgePaths) {
        try {
          if (fs.existsSync(path)) {
            edgePath = path;
            console.log('Edge encontrado en:', path);
            break;
          }
        } catch (error) {
          console.log('Edge no encontrado en:', path);
        }
      }

      if (!edgePath) {
        throw new Error('Microsoft Edge no encontrado en el sistema');
      }

      // Configuración específica para Edge
      const browserOptions = {
        executablePath: edgePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--font-render-hinting=none'
        ],
        ignoreHTTPSErrors: true,
        timeout: 30000
      };

      console.log('Lanzando Microsoft Edge...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Edge lanzado exitosamente');

      const page = await browser.newPage();
      
      // Configurar viewport
      await page.setViewport({ 
        width: 1200, 
        height: 800 
      });

      console.log('Cargando contenido HTML...');
      
      // Cargar contenido
      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      console.log('Esperando renderizado...');
      await new Promise(resolve => setTimeout(resolve, 1000));

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

      if (!pdfBuffer || pdfBuffer.length === 0) {
        throw new Error('PDF generado está vacío');
      }

      console.log('PDF generado exitosamente con Edge - Tamaño:', pdfBuffer.length, 'bytes');
      return pdfBuffer;

    } catch (error) {
      console.error('ERROR en generatePDF:', error.message);
      throw error;
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('Navegador cerrado');
        } catch (closeError) {
          console.log('Error al cerrar navegador:', closeError.message);
        }
      }
    }
  }
}

export default PuppeteerPDF;