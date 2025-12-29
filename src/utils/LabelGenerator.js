/**
 * Label and QR Code Generator
 * Generates printable labels and QR codes for devices
 */

/**
 * Generate QR code data URL for a device
 * @param {Object} device - Device object
 * @returns {Promise<string>} Data URL of QR code image
 */
export async function generateQRCode(device) {
    // Dynamic import of qrcode library
    const QRCode = (await import('qrcode')).default;
    
    // Build QR code content
    const qrData = {
        name: device.name,
        nodeId: device.nodeId || device.id,
        config: device.config || device.pendingConfig || {},
        timestamp: new Date().toISOString()
    };
    
    const qrString = JSON.stringify(qrData);
    
    try {
        const dataUrl = await QRCode.toDataURL(qrString, {
            width: 300,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        return dataUrl;
    } catch (error) {
        console.error('QR code generation failed:', error);
        throw new Error(`Failed to generate QR code: ${error.message}`);
    }
}

/**
 * Generate device label HTML
 * @param {Object} device - Device object
 * @param {string} [template='simple'] - Label template: 'simple', 'detailed', 'qr-only'
 * @returns {Promise<string>} HTML string for label
 */
export async function generateDeviceLabel(device, template = 'simple') {
    const config = device.config || device.pendingConfig || {};
    const boardInfo = device.boardName ? `${device.boardName} (${device.boardVendor})` : 'Unknown Board';
    
    let qrCodeDataUrl = '';
    if (template !== 'detailed') {
        try {
            qrCodeDataUrl = await generateQRCode(device);
        } catch (e) {
            console.warn('QR code generation failed, continuing without QR code');
        }
    }
    
    if (template === 'qr-only') {
        return `
            <div style="width: 2in; height: 2in; padding: 0.25in; border: 1px solid #000; text-align: center;">
                <div style="font-weight: bold; margin-bottom: 0.1in; font-size: 14pt;">${device.name}</div>
                ${qrCodeDataUrl ? `<img src="${qrCodeDataUrl}" style="width: 1.5in; height: 1.5in;" />` : '<div style="color: red;">QR Code Error</div>'}
            </div>
        `;
    }
    
    if (template === 'detailed') {
        return `
            <div style="width: 4in; height: 3in; padding: 0.25in; border: 1px solid #000; font-family: Arial, sans-serif;">
                <div style="font-weight: bold; font-size: 18pt; margin-bottom: 0.2in; border-bottom: 2px solid #000; padding-bottom: 0.1in;">
                    ${device.name}
                </div>
                <div style="font-size: 10pt; line-height: 1.4;">
                    <div><strong>Board:</strong> ${boardInfo}</div>
                    <div><strong>Connection:</strong> ${device.connectionType || 'N/A'}</div>
                    ${config.region ? `<div><strong>Region:</strong> ${config.region}</div>` : ''}
                    ${config.channelName ? `<div><strong>Channel:</strong> ${config.channelName}</div>` : ''}
                    ${config.role ? `<div><strong>Role:</strong> ${config.role}</div>` : ''}
                    ${device.nodeId ? `<div><strong>Node ID:</strong> ${device.nodeId}</div>` : ''}
                    ${device.tags && device.tags.length > 0 ? `<div><strong>Tags:</strong> ${device.tags.join(', ')}</div>` : ''}
                </div>
                ${qrCodeDataUrl ? `<div style="margin-top: 0.2in; text-align: center;"><img src="${qrCodeDataUrl}" style="width: 1in; height: 1in;" /></div>` : ''}
            </div>
        `;
    }
    
    // Simple template (default)
    return `
        <div style="width: 3in; height: 2in; padding: 0.25in; border: 1px solid #000; text-align: center; font-family: Arial, sans-serif;">
            <div style="font-weight: bold; font-size: 16pt; margin-bottom: 0.15in;">
                ${device.name}
            </div>
            <div style="font-size: 9pt; margin-bottom: 0.15in; color: #666;">
                ${boardInfo}
            </div>
            ${qrCodeDataUrl ? `<img src="${qrCodeDataUrl}" style="width: 1.2in; height: 1.2in; margin-bottom: 0.1in;" />` : ''}
            <div style="font-size: 8pt; color: #666;">
                ${config.region || ''} ${config.channelName || ''}
            </div>
        </div>
    `;
}

/**
 * Generate labels for multiple devices
 * @param {Array} devices - Array of device objects
 * @param {string} [template='simple'] - Label template
 * @returns {Promise<string>} HTML string with all labels
 */
export async function generateBatchLabels(devices, template = 'simple') {
    const labelPromises = devices.map(device => generateDeviceLabel(device, template));
    const labels = await Promise.all(labelPromises);
    
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Batchtastic Device Labels</title>
            <style>
                @media print {
                    @page {
                        size: letter;
                        margin: 0.5in;
                    }
                    .label-page {
                        page-break-after: always;
                    }
                }
                body {
                    font-family: Arial, sans-serif;
                    margin: 0;
                    padding: 0.5in;
                }
                .label-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 0.25in;
                }
            </style>
        </head>
        <body>
            <div class="label-grid">
                ${labels.join('')}
            </div>
        </body>
        </html>
    `;
}

/**
 * Print labels
 * @param {string} labelHTML - HTML string with labels
 */
export function printLabels(labelHTML) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        throw new Error('Popup blocked. Please allow popups to print labels.');
    }
    
    printWindow.document.write(labelHTML);
    printWindow.document.close();
    
    printWindow.onload = () => {
        printWindow.print();
    };
}

/**
 * Download labels as HTML file
 * @param {string} labelHTML - HTML string with labels
 * @param {string} filename - Filename for download
 */
export function downloadLabels(labelHTML, filename = 'batchtastic-labels.html') {
    const blob = new Blob([labelHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

