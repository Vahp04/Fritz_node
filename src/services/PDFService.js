import puppeteer from 'puppeteer';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';

class PDFService {
  static async generatePDF(htmlContent) {
    let browser = null;
    let page = null;
    
    try {
      console.log('🚀 Iniciando generación de PDF...');
      
      // Forzar cierre de procesos Chrome existentes primero
      await this.killChromeProcesses();
      
      // Buscar Chrome instalado
      const executablePath = await this.findChromePath();
      
      const browserOptions = {
        executablePath: executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions',
          '--single-process'
        ],
        timeout: 60000 // 60 segundos para iniciar
      };

      console.log('📋 Configurando browser...');
      browser = await puppeteer.launch(browserOptions);
      
      console.log('📄 Creando página...');
      page = await browser.newPage();
      
      // Configuraciones optimizadas
      await page.setViewport({ width: 1200, height: 800 });
      page.setDefaultTimeout(45000); // 45 segundos timeout
      page.setDefaultNavigationTimeout(45000);

      // Optimización: bloquear recursos innecesarios
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        // Solo permitir documentos y estilos
        if (['image', 'font', 'media'].includes(request.resourceType())) {
          request.abort();
        } else {
          request.continue();
        }
      });

      console.log('📝 Cargando contenido HTML...');
      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded', // Más rápido que networkidle0
        timeout: 30000
      });

      // Espera mínima para renderizado
      await new Promise(resolve => setTimeout(resolve, 500));

      console.log('📊 Generando PDF...');
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm', 
          bottom: '20mm',
          left: '15mm'
        },
        timeout: 30000
      });

      console.log('✅ PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('❌ Error generando PDF:', error);
      throw error;
    } finally {
      // Limpieza garantizada
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.error('Error cerrando página:', e.message);
        }
      }
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          console.error('Error cerrando browser:', e.message);
        }
      }
      // Limpieza final de procesos
      await this.killChromeProcesses();
    }
  }

  static async findChromePath() {
    const chromePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
    ];

    for (const chromePath of chromePaths) {
      if (fs.existsSync(chromePath)) {
        console.log('✅ Chrome encontrado:', chromePath);
        return chromePath;
      }
    }
    
    console.log('⚠️ Usando Chrome incluido con Puppeteer');
    return null;
  }

  static async killChromeProcesses() {
    return new Promise((resolve) => {
      try {
        if (os.platform() === 'win32') {
          const taskkill = spawn('taskkill', ['/f', '/im', 'chrome.exe', '/t']);
          taskkill.on('close', () => resolve());
          taskkill.on('error', () => resolve());
        } else {
          resolve();
        }
        setTimeout(resolve, 3000);
      } catch (error) {
        resolve();
      }
    });
  }
}

export default PDFService;