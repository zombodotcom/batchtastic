/**
 * Lightweight SVG-based chart renderer
 * Used for SNR and Air Utilization visualization
 */

/**
 * Render SNR line chart as SVG
 * @param {Array} history - Array of {timestamp, snr} objects
 * @param {number} width - Chart width in pixels
 * @param {number} height - Chart height in pixels
 * @returns {string} SVG markup
 */
export function renderSNRChart(history, width = 200, height = 60) {
    if (!history || history.length === 0) {
        return `<svg width="${width}" height="${height}" style="background: var(--bg-secondary); border-radius: 4px;"></svg>`;
    }

    const padding = 4;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    
    // Find min/max SNR values
    const snrValues = history.map(h => h.snr);
    const minSNR = Math.min(...snrValues);
    const maxSNR = Math.max(...snrValues);
    const range = maxSNR - minSNR || 1; // Avoid division by zero
    
    // Generate path points
    const points = history.map((point, index) => {
        const x = padding + (index / (history.length - 1 || 1)) * chartWidth;
        const y = padding + chartHeight - ((point.snr - minSNR) / range) * chartHeight;
        return `${x},${y}`;
    }).join(' ');
    
    // Create path string
    const pathD = `M ${points}`;
    
    // Determine color based on average SNR
    const avgSNR = snrValues.reduce((a, b) => a + b, 0) / snrValues.length;
    let strokeColor = '#4CAF50'; // Green for good SNR
    if (avgSNR < 0) strokeColor = '#F44336'; // Red for poor SNR
    else if (avgSNR < 5) strokeColor = '#FF9800'; // Orange for moderate SNR
    
    return `
        <svg width="${width}" height="${height}" style="background: var(--bg-secondary); border-radius: 4px;">
            <polyline 
                points="${points}" 
                fill="none" 
                stroke="${strokeColor}" 
                stroke-width="2"
                style="filter: drop-shadow(0 0 2px ${strokeColor}40);"
            />
            <text x="${width - padding}" y="${height - padding}" 
                  style="font-size: 8px; fill: var(--text-dim); text-anchor: end;">
                ${history[history.length - 1].snr}dB
            </text>
        </svg>
    `;
}

/**
 * Render Air Utilization bar chart as SVG
 * @param {Array} history - Array of {timestamp, util} objects
 * @param {number} width - Chart width in pixels
 * @param {number} height - Chart height in pixels
 * @returns {string} SVG markup
 */
export function renderAirUtilChart(history, width = 200, height = 60) {
    if (!history || history.length === 0) {
        return `<svg width="${width}" height="${height}" style="background: var(--bg-secondary); border-radius: 4px;"></svg>`;
    }

    const padding = 4;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;
    const barWidth = Math.max(2, chartWidth / Math.min(history.length, 50)); // Max 50 bars
    
    // Get recent values (last 50)
    const recentHistory = history.slice(-50);
    
    // Determine color based on utilization
    const latestUtil = recentHistory[recentHistory.length - 1].util;
    let barColor = '#4CAF50'; // Green for low utilization
    if (latestUtil > 80) barColor = '#F44336'; // Red for high utilization
    else if (latestUtil > 50) barColor = '#FF9800'; // Orange for moderate
    
    const bars = recentHistory.map((point, index) => {
        const x = padding + index * barWidth;
        const barHeight = (point.util / 100) * chartHeight;
        const y = padding + chartHeight - barHeight;
        
        return `<rect x="${x}" y="${y}" width="${barWidth - 1}" height="${barHeight}" 
                      fill="${barColor}" opacity="0.7" />`;
    }).join('');
    
    return `
        <svg width="${width}" height="${height}" style="background: var(--bg-secondary); border-radius: 4px;">
            ${bars}
            <line x1="${padding}" y1="${padding + chartHeight * 0.8}" 
                  x2="${width - padding}" y2="${padding + chartHeight * 0.8}" 
                  stroke="#FF9800" stroke-width="1" stroke-dasharray="2,2" opacity="0.5" />
            <text x="${width - padding}" y="${height - padding}" 
                  style="font-size: 8px; fill: var(--text-dim); text-anchor: end;">
                ${latestUtil}%
            </text>
        </svg>
    `;
}

