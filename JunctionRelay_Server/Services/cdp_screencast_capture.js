/**
 * CDP Screencast Capture - Subprocess version for C# integration
 *
 * Captures a web page using Chrome DevTools Protocol's Page.startScreencast
 * and provides frames via HTTP MJPEG stream that C# can consume.
 *
 * Usage: node cdp_screencast_capture.js <url> <width> <height> <port> <quality>
 */

const puppeteer = require('puppeteer');
const http = require('http');

// Parse command-line arguments
const args = process.argv.slice(2);
if (args.length < 6) {
    console.error('[CDP_CAPTURE] ERROR: Missing arguments');
    console.error('[CDP_CAPTURE] Usage: node cdp_screencast_capture.js <url> <width> <height> <port> <quality> <fps>');
    process.exit(1);
}

const TARGET_URL = args[0];
const VIEWPORT_WIDTH = parseInt(args[1]);
const VIEWPORT_HEIGHT = parseInt(args[2]);
const HTTP_PORT = parseInt(args[3]);
const JPEG_QUALITY = parseInt(args[4]);
const STREAM_FPS = parseInt(args[5]) || 30;  // Target FPS from argument or default to 30

// Global state
let browser = null;
let page = null;
let cdpSession = null;
let clients = [];
let frameCount = 0;
let captureStartTime = null;

console.log('[CDP_CAPTURE] Starting with config:');
console.log(`[CDP_CAPTURE]   URL: ${TARGET_URL}`);
console.log(`[CDP_CAPTURE]   Viewport: ${VIEWPORT_WIDTH}x${VIEWPORT_HEIGHT}`);
console.log(`[CDP_CAPTURE]   HTTP Port: ${HTTP_PORT}`);
console.log(`[CDP_CAPTURE]   JPEG Quality: ${JPEG_QUALITY}`);
console.log(`[CDP_CAPTURE]   Target FPS: ${STREAM_FPS}`);

/**
 * Initialize Puppeteer browser and navigate to target URL
 */
async function initBrowser() {
    console.log('[CDP_CAPTURE] Launching browser...');

    browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--disable-gpu',
            '--hide-scrollbars'
        ]
    });

    page = await browser.newPage();

    await page.setViewport({
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        deviceScaleFactor: 1.0
    });

    console.log(`[CDP_CAPTURE] Navigating to ${TARGET_URL}`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

    // Inject CSS to remove all margins/padding and scrollbars with !important
    await page.addStyleTag({
        content: `
            * {
                margin: 0 !important;
                padding: 0 !important;
            }
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                width: 100% !important;
                height: 100% !important;
            }
        `
    });

    // Small delay for page load
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('[CDP_CAPTURE] Browser initialized and navigated');
}

/**
 * Start screencast using Chrome DevTools Protocol
 */
async function startScreencast() {
    console.log('[CDP_CAPTURE] Creating CDP session...');

    // Create CDP session
    cdpSession = await page.target().createCDPSession();

    console.log('[CDP_CAPTURE] Starting Page.startScreencast...');

    // Listen for screencast frames
    cdpSession.on('Page.screencastFrame', async (frame) => {
        frameCount++;

        if (!captureStartTime) {
            captureStartTime = Date.now();
        }

        // Decode base64 JPEG
        const jpegBuffer = Buffer.from(frame.data, 'base64');

        // Acknowledge frame (required by CDP)
        await cdpSession.send('Page.screencastFrameAck', { sessionId: frame.sessionId });

        // Log stats every 60 frames (disabled for production)
        // if (frameCount % 60 === 0) {
        //     const elapsed = (Date.now() - captureStartTime) / 1000;
        //     const avgFps = frameCount / elapsed;
        //     const frameSizeKb = jpegBuffer.length / 1024;
        //     console.log(`[CDP_CAPTURE] Frame ${frameCount}: ${avgFps.toFixed(1)} FPS avg, ${frameSizeKb.toFixed(1)} KB`);
        // }

        // Broadcast to all connected HTTP clients
        broadcastFrame(jpegBuffer);
    });

    // Start screencast
    await cdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: JPEG_QUALITY,
        maxWidth: VIEWPORT_WIDTH,
        maxHeight: VIEWPORT_HEIGHT,
        everyNthFrame: Math.max(1, Math.floor(60 / STREAM_FPS))
    });

    console.log('[CDP_CAPTURE] Screencast started successfully');
}

/**
 * Broadcast MJPEG frame to all connected HTTP clients
 */
function broadcastFrame(frameData) {
    const boundary = '--frame';
    const header = Buffer.from(
        `${boundary}\r\n` +
        `Content-Type: image/jpeg\r\n` +
        `Content-Length: ${frameData.length}\r\n` +
        `\r\n`
    );

    clients.forEach((client, index) => {
        try {
            client.write(header);
            client.write(frameData);
            client.write('\r\n');
        } catch (err) {
            // Client disconnected, will be removed below
            clients.splice(index, 1);
        }
    });
}

/**
 * Create HTTP server for MJPEG stream
 */
function createHttpServer() {
    const server = http.createServer((req, res) => {
        if (req.url === '/stream') {
            console.log('[CDP_CAPTURE] Client connected to stream');

            res.writeHead(200, {
                'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            clients.push(res);

            req.on('close', () => {
                console.log('[CDP_CAPTURE] Client disconnected');
                clients = clients.filter(client => client !== res);
            });

        } else if (req.url === '/health') {
            // Health check endpoint for C#
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                frameCount: frameCount,
                clients: clients.length
            }));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    server.listen(HTTP_PORT, '0.0.0.0', () => {
        console.log(`[CDP_CAPTURE] HTTP server listening on http://0.0.0.0:${HTTP_PORT}`);
        console.log(`[CDP_CAPTURE] Stream URL: http://0.0.0.0:${HTTP_PORT}/stream`);
        console.log(`[CDP_CAPTURE] READY`);  // Signal to C# that we're ready
    });
}

/**
 * Cleanup on exit
 */
async function cleanup() {
    console.log('[CDP_CAPTURE] Shutting down...');

    if (cdpSession) {
        try {
            await cdpSession.send('Page.stopScreencast');
            await cdpSession.detach();
        } catch (err) {
            // Ignore
        }
    }

    if (browser) {
        await browser.close();
    }

    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

/**
 * Main entry point
 */
async function main() {
    try {
        // Start HTTP server
        createHttpServer();

        // Initialize browser
        await initBrowser();

        // Start screencast
        await startScreencast();

    } catch (error) {
        console.error('[CDP_CAPTURE] ERROR:', error);
        await cleanup();
    }
}

// Run
main();
