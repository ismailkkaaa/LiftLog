window.LiftLogCharts = (() => {
    const defaults = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: { color: "#64748b" },
            },
            y: {
                grid: { color: "rgba(148, 163, 184, 0.18)" },
                ticks: { color: "#64748b" },
            },
        },
    };

    function renderLine(id, labels, values, label, color) {
        const element = document.getElementById(id);
        if (!element) return;
        new Chart(element, {
            type: "line",
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    fill: true,
                    tension: 0.38,
                    borderColor: color,
                    backgroundColor: `${color}22`,
                    pointBackgroundColor: color,
                    pointRadius: 4,
                    pointHoverRadius: 5,
                }],
            },
            options: defaults,
        });
    }

    function renderBar(id, labels, values, color) {
        const element = document.getElementById(id);
        if (!element) return;
        new Chart(element, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: color,
                    borderRadius: 14,
                    borderSkipped: false,
                }],
            },
            options: defaults,
        });
    }

    return {
        renderLine,
        renderBar,
    };
})();
