import {createContainers, processGetUserMedia, createCandidateTable, processDescriptionEvent, createGraphOptions} from './import-common.js';

const SDPUtils = window.adapter.sdp;

export class WebRTCInternalsDumpImporter {
    constructor() {
        this.graphs = {};
        this.containers = {};
    }

    process(blob) {
        this.data = JSON.parse(blob);
        this.processGetUserMedia();
        this.importUpdatesAndStats();
    }

    processGetUserMedia() {
        // FIXME: also display GUM calls (can they be correlated to addStream?)
        processGetUserMedia(this.data.getUserMedia, document.getElementById('tables'));
    }

    importUpdatesAndStats() {
        if (this.data.UserAgentData && this.data.UserAgentData.length >= 2) {
            document.getElementById('userAgent').innerText +=
                this.data.UserAgentData[2].brand + ' ' +
                this.data.UserAgentData[1].version + ' / ' ;
        }
        document.getElementById('userAgent').innerText += this.data.UserAgent;

        for (let connectionId in this.data.PeerConnections) {
            const container = createContainers(connectionId, this.data.PeerConnections[connectionId].url, this.containers);
            document.getElementById('tables').appendChild(container);
        }
        for (let connectionId in this.data.PeerConnections) {
            const connection = this.data.PeerConnections[connectionId];
            let legacy = false;
            for (let reportname in connection.stats) {
                if (reportname.startsWith('Conn-')) {
                    legacy = true;
                    break;
                }
            }
            if (legacy) {
                document.getElementById('legacy').style.display = 'block';
            }
        }
        setTimeout(this.processConnections.bind(this), 0, Object.keys(this.data.PeerConnections));
    }

    processConnections(connectionIds) {
        const connectionId = connectionIds.shift();
        if (!connectionId) return;
        setTimeout(this.processConnections.bind(this), 0, connectionIds)

        const connection = this.data.PeerConnections[connectionId];
        const container = this.containers[connectionId];

        // Display the updateLog
        this.containers[connectionId].url.innerText = 'Origin: ' + connection.url;
        this.containers[connectionId].configuration.innerText = 'Configuration: ' + JSON.stringify(connection.rtcConfiguration, null, ' ') + '\n';
        this.containers[connectionId].configuration.innerText += 'Legacy (chrome) constraints: ' + JSON.stringify(connection.constraints, null, ' ');

        const state = {};
        connection.updateLog.forEach(traceEvent => {
            const row = this.processTraceEvent(traceEvent, state);
            if (row) {
                this.containers[connectionId].updateLog.appendChild(row);
            }
            if (traceEvent.type === 'createOfferOnSuccess') {
                state.lastCreatedOffer = traceEvent.value;
            } else if (traceEvent.type === 'createAnswerOnSuccess') {
                state.lastCreatedAnswer = traceEvent.value;
            } else if (traceEvent.type === 'setLocalDescription') {
                state.lastCreatedOffer = undefined;
                state.lastCreatedAnswer = undefined;
            } else if (traceEvent.type === 'setRemoteDescription') {
                state.lastRemoteDescription = traceEvent.value;
            } else if (traceEvent.type == 'signalingstatechange' && traceEvent.value === 'stable') {
                state.lastRemoteDescription = undefined;
            }
        });
        connection.updateLog.forEach(traceEvent => {
            // update state displays
            if (traceEvent.type === 'iceconnectionstatechange') {
                this.containers[connectionId].iceConnectionState.textContent += ' => ' + traceEvent.value;
            }
            if (traceEvent.type === 'connectionstatechange') {
                this.containers[connectionId].connectionState.textContent += ' => ' + traceEvent.value;
            }
        });
        connection.updateLog.forEach(traceEvent => {
            // FIXME: would be cool if a click on this would jump to the table row
            if (traceEvent.type === 'signalingstatechange') {
                this.containers[connectionId].signalingState.textContent += ' => ' + traceEvent.value;
            }
        });

        const referenceTime = document.getElementById('useReferenceTime').checked && connection.updateLog.length
            ? new Date(connection.updateLog[0].time).getTime()
            : undefined;
        this.graphs[connectionId] = {};

        const reportobj = createInternalsTimeSeries(connection);
        if (reportobj) {
            const lastStats = {};
            for (let id in reportobj) {
                const report = reportobj[id];
                const lastReport = {type: report.type};
                Object.keys(report).forEach(property => {
                    if (!Array.isArray(report[property])) return;
                    const [key, values] = report[property];
                    lastReport[key] = values[values.length - 1][1];
                });
                lastStats[id] = lastReport;
            }
            createCandidateTable(lastStats, this.containers[connectionId].candidates);
        }

        Object.keys(reportobj).forEach(reportname => {
            const reports = reportobj[reportname];
            const statsType = reports.type;
            // ignore useless graphs
            if (['local-candidate', 'remote-candidate', 'codec', 'stream', 'track'].includes(statsType)) return;

            const graphOptions = createGraphOptions(reportname, statsType, reports, referenceTime);
            if (!graphOptions) {
                return;
            }

            const container = document.createElement('details');
            if (graphOptions.series.statsType) {
                container.attributes['data-statsType'] = graphOptions.series.statsType;
            }
            this.containers[connectionId].graphs.appendChild(container);
            // TODO: keep in sync with
            // https://source.chromium.org/chromium/chromium/src/+/main:content/browser/webrtc/resources/stats_helper.js
            const title = [
                'type', 'kind',
                'ssrc', 'rtxSsrc', 'fecSsrc',
                'mid', 'rid',
                'label',
                '[codec]',
                'encoderImplementation', 'decoderImplementation',
                'trackIdentifier',
                'id',
            ].filter(key => graphOptions.labels[key] !== undefined)
                .map(key => {
                    return ({statsType: 'type', trackIdentifier: 'track'}[key] || key) + '=' + JSON.stringify(graphOptions.labels[key]);
                }).join(', ');

            const titleElement = document.createElement('summary');
            titleElement.innerText = title;
            container.appendChild(titleElement);

            const d = document.createElement('div');
            d.id = 'chart_' + Date.now();
            d.classList.add('graph');
            container.appendChild(d);

            const graph = new Highcharts.Chart(d, graphOptions);
            this.graphs[connectionId][reportname] = graph;

            // expand the graph when opening
            container.ontoggle = () => container.open && graph.reflow();

            // draw checkbox to turn off everything
            ((reportname, container, graph) => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                container.appendChild(checkbox);
                const label = document.createElement('label');
                label.innerText = 'Turn on/off all data series'
                container.appendChild(label);
                checkbox.onchange = function() {
                    graph.series.forEach(series => {
                        series.setVisible(!checkbox.checked, false);
                    });
                    graph.redraw();
                };
            })(reportname, container, graph);
        });
    }

    processTraceEvent(traceEvent, state) {
        const row = document.createElement('tr');
        let el = document.createElement('td');
        el.setAttribute('nowrap', '');
        el.innerText = traceEvent.time;
        row.appendChild(el);

        // recreate the HTML of webrtc-internals
        const details = document.createElement('details');
        el = document.createElement('summary');
        el.innerText = traceEvent.type;
        details.appendChild(el);

        if (['іcecandidate', 'addIceCandidate'].includes(traceEvent.type)) {
            if (traceEvent.value) {
                const parts = traceEvent.value.split(', ')
                    .map(part => part.split(': '));
                const toShow = [];
                parts.forEach(part => {
                    if (['sdpMid', 'sdpMLineIndex'].includes(part[0])) {
                        toShow.push(part.join(': '));
                    } else if (part[0] === 'candidate') {
                        const candidate = SDPUtils.parseCandidate(part[1].trim());
                        if (candidate) {
                            toShow.push('port:' + candidate.port);
                            toShow.push('type: ' + candidate.type);
                        }
                    } else if (part[0] === 'relayProtocol') {
                        toShow.push('relayProtocol: ' + part[1]);
                    }
                });
                el.innerText += ' (' + toShow.join(', ') + ')';
            }
        }
        if (traceEvent.value.indexOf(', sdp: ') != -1) {
            const [type, sdp] = traceEvent.value.substr(6).split(', sdp: ');
            let last_sections;
            let remote_sections;
            if (traceEvent.type === 'setLocalDescription') {
                const [last_type, last_sdp] = (type === 'offer' ? state.lastCreatedOffer : state.lastCreatedAnswer)
                    .substr(6).split(', sdp: ');
                if (sdp != last_sdp) {
                    last_sections = SDPUtils.splitSections(last_sdp);
                }
                if (state.remoteDescription) {
                    const [remote_type, remote_sdp] = state.remoteDescription.substr(6).split(', sdp: ');
                    remote_sections = SDPUtils.splitSections(remote_sdp);
                }
            }
            processDescriptionEvent(details, traceEvent.type, {type, sdp}, last_sections, remote_sections);
        } else {
            el = document.createElement('pre');
            el.innerText = traceEvent.value;
        }
        details.appendChild(el);
        el = document.createElement('td');
        if (traceEvent.value !== '') {
            el.appendChild(details);
        } else {
            el.innerText = traceEvent.type;
        }
        row.appendChild(el);

        // If the traceEvent type ends with 'Failure' hightlight it
        if (traceEvent.type.endsWith('Failure')) {
            row.style.backgroundColor = 'red';
        }
        // Likewise, highlight (ice)connectionstates.
        if (['iceconnectionstatechange', 'connectionstatechange'].includes(traceEvent.type)) {
            switch(traceEvent.value) {
                case 'connected':
                case 'completed':
                    row.style.backgroundColor = 'green';
                    break;
                case 'failed':
                    row.style.backgroundColor = 'red';
                    break;
            }
        }
        return row;
    }
}

function createInternalsTimeSeries(connection) {
    const reportobj = {};
    for (let reportname in connection.stats) {
        if (reportname.startsWith('Conn-')) {
            return {}; // legacy stats, no longer supported. Warning is shown above.
        }
    }
    for (let reportname in connection.stats) {
        // special casing of computed stats, in particular [a-b]
        let stat;
        let comp;
        if (reportname.indexOf('[') !== -1) {
            const t = reportname.split('[');
            comp = '[' + t.pop();
            stat = t.join('');
            stat = stat.substr(0, stat.length - 1);
        } else {
            const t = reportname.split('-');
            comp = t.pop();
            stat = t.join('-');
        }

        if (!reportobj.hasOwnProperty(stat)) {
            reportobj[stat] = [];
            reportobj[stat].type = connection.stats[reportname].statsType;
            reportobj[stat].startTime = new Date(connection.stats[reportname].startTime).getTime();
            reportobj[stat].endTime = new Date(connection.stats[reportname].endTime).getTime();
        }
        let values = JSON.parse(connection.stats[reportname].values);
        // Individual timestamps were added in crbug.com/1462567 in M117.
        if (connection.stats[stat + '-timestamp']) {
            const timestamps = JSON.parse(connection.stats[stat + '-timestamp'].values);
            values = values.map((currentValue, index) => [timestamps[index], currentValue]);
        } else {
            // Fallback to the assumption that stats were gathered every second.
            values = values.map((currentValue, index) => [reportobj[stat].startTime + 1000 * index, currentValue]);
        }
        reportobj[stat].push([comp, values]);
    }
    return reportobj;
}


