import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { execSync } from 'child_process';

class PuppeteerPDF {
  static async generatePDF(htmlContent, options = {}) {
    let browser;
    
    try {
      console.log('=== INICIANDO GENERACIÓN PDF ===');

      // 1. Matar procesos de Chrome existentes antes de empezar
      await this.killChromeProcesses();
      
      // 2. Buscar Chrome
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      ];

      let executablePath = null;
      for (const chromePath of chromePaths) {
        if (fs.existsSync(chromePath)) {
          executablePath = chromePath;
          console.log('Chrome encontrado:', executablePath);
          break;
        }
      }

      if (!executablePath) {
        throw new Error('No se encontró Chrome instalado');
      }

      // 3. Configuración SIN userDataDir y con puerto específico
      const browserOptions = {
        headless: 'new',
        executablePath: executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--disable-gpu',
          '--single-process',
          '--disable-web-security',
          '--no-default-browser-check',
          '--disable-component-extensions-with-background-pages',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI,BlinkGenPropertyTrees'
        ],
        timeout: 15000 // Timeout más corto
      };

      console.log('Lanzando browser...');
      browser = await puppeteer.launch(browserOptions);
      console.log('Browser iniciado correctamente');

      const page = await browser.newPage();
      await page.setViewport({ width: 1200, height: 800 });
      page.setDefaultTimeout(30000);

      await page.setContent(htmlContent, {
        waitUntil: 'domcontentloaded', // Más rápido que networkidle0
        timeout: 30000
      });

      await page.evaluateHandle('document.fonts.ready');
      await new Promise(resolve => setTimeout(resolve, 300));

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

      console.log('PDF generado exitosamente');
      return pdfBuffer;

    } catch (error) {
      console.error('Error en generatePDF:', error.message);
      throw error;
    } finally {
      // Cerrar browser de manera agresiva
      if (browser) {
        try {
          await browser.close();
          console.log('Browser cerrado');
        } catch (closeError) {
          console.warn('Forzando cierre de browser...');
          await this.killChromeProcesses();
        }
      }
      
      // Matar cualquier proceso residual
      await this.killChromeProcesses();
    }
  }

  static async killChromeProcesses() {
    try {
      console.log('Matando procesos de Chrome...');
      
      // En Windows
      execSync('taskkill /f /im chrome.exe /t', { 
        stdio: 'ignore',
        windowsHide: true 
      });
      
      // También matar procesos de Chromium por si acaso
      execSync('taskkill /f /im chromium.exe /t', { 
        stdio: 'ignore',
        windowsHide: true 
      });
      
      execSync('taskkill /f /im headless_shell.exe /t', { 
        stdio: 'ignore',
        windowsHide: true 
      });
      
      console.log('Procesos de Chrome eliminados');
      
    } catch (error) {
      // No hacer nada si no hay procesos que matar
      console.log('No había procesos de Chrome activos');
    }
  }
}

export default PuppeteerPDF;