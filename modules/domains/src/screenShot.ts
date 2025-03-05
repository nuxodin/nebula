
export async function getScreenShot(url: string): Promise<Uint8Array> {
    const puppeteer = await import("https://deno.land/x/puppeteer@16.2.0/mod.ts");

    const browser = await puppeteer.default.launch({
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        headless: true
    });
    const page = await browser.newPage();
    
    try {
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(`http://${url}`, { 
            waitUntil: "networkidle2",
            timeout: 30000 
        });
        
        const screenshotBuffer = await page.screenshot({ 
            fullPage: true, 
            encoding: "binary",
            type: 'png'
        });
        
        return screenshotBuffer;
    } finally {
        await browser.close();
    }
}