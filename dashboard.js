document.addEventListener('DOMContentLoaded', () => {
    const logBody = document.getElementById('log-body');
    const totalViolationsElem = document.getElementById('total-violations');
    const criticalAlertsElem = document.getElementById('critical-alerts');
    const refreshBtn = document.getElementById('refresh-btn');
    const uptimeElem = document.getElementById('uptime');

    let startTime = Date.now();

    // --- UPTIME ENGINE ---
    function updateUptime() {
        const diff = Date.now() - startTime;
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        uptimeElem.innerText = `${h}:${m}:${s}`;
    }
    setInterval(updateUptime, 1000);

    // --- DATA FETCHER ---
    async function fetchHistory() {
        try {
            const response = await fetch('/history');
            const data = await response.json();
            renderLogs(data);
        } catch (error) {
            console.error("❌ FAILED TO FETCH NEMESIS DATA:", error);
        }
    }

    function renderLogs(logs) {
        logBody.innerHTML = '';

        // Reverse logs to show latest first
        const reversedLogs = [...logs].reverse();

        let criticalCount = 0;

        reversedLogs.forEach(log => {
            const tr = document.createElement('tr');

            // Map severity if exists, else default to 2
            const severity = log.severite || (log.rule === 'LOGIQUE' || log.rule === 'FAIT' ? 3 : 2);
            if (severity === 3) criticalCount++;

            tr.innerHTML = `
                <td><span style="color: #888">[</span>${log.timestamp}<span style="color: #888">]</span></td>
                <td><span style="color: var(--primary)">${log.source}</span></td>
                <td>${log.window}</td>
                <td>
                    <div style="font-weight: bold">${log.error}</div>
                    <div style="font-size: 0.75rem; color: #777">REQ: ${log.rule}</div>
                </td>
                <td><span class="severity-pill sev-${severity}">LVL ${severity}</span></td>
            `;
            logBody.appendChild(tr);
        });

        totalViolationsElem.innerText = logs.length;
        criticalAlertsElem.innerText = criticalCount;
    }

    // --- INITIALIZATION ---
    fetchHistory();

    // Auto-refresh every 5 seconds
    setInterval(fetchHistory, 5000);

    refreshBtn.addEventListener('click', () => {
        refreshBtn.innerText = "SYNCHING...";
        fetchHistory().then(() => {
            setTimeout(() => {
                refreshBtn.innerText = "REFRESH SYSTEM";
            }, 1000);
        });
    });
});
