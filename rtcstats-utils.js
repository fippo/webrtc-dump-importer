function decompress(baseStats, newStats) {
    const timestamp = newStats.timestamp
    delete newStats.timestamp;
    Object.keys(newStats).forEach(id => {
        if (!baseStats[id]) {
            if (newStats[id].timestamp === 0) {
                newStats[id].timestamp = timestamp;
            }
            baseStats[id] = newStats[id];
        } else {
            const report = newStats[id];
            if (report.timestamp === 0) {
                report.timestamp = timestamp;
            } else if (!report.timestamp) {
                report.timestamp = new Date(baseStats[id].timestamp).getTime();
            }
            Object.keys(report).forEach(name => {
                baseStats[id][name] = report[name];
            });
        }
    });
    return baseStats;
}
