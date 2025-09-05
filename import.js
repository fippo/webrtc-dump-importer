import {createContainers, processGetUserMedia, createCandidateTable, processDescriptionEvent, createGraphOptions} from './import-common.js';

const SDPUtils = window.adapter.sdp;

export class WebRTCInternalsDumpImporter extends EventTarget {
    constructor(container) {
        super();
        this.graphs = {};
        this.container = container;
        this.containers = {};
    }

    process(blob) {
        this.data = JSON.parse(blob);
        this.processUserAgent();
        this.processGetUserMedia();
        this.importUpdatesAndStats();
    }

    processUserAgent() {
        const container = document.createElement('div');
        const label = document.createElement('span');
        label.innerText = 'User Agent:';
        container.appendChild(label);

        const ua = document.createElement('span');
        if (this.data.UserAgentData && this.data.UserAgentData.length >= 2) {
            ua.innerText =
                this.data.UserAgentData[2].brand + ' ' +
                this.data.UserAgentData[1].version + ' / ' ;
        }
        ua.innerText += this.data.UserAgent;
        container.appendChild(ua);
        this.container.appendChild(container);

        this.dispatchEvent(new Event('processed-useragent'));
    }

    processGetUserMedia() {
        // FIXME: also display GUM calls (can they be correlated to addStream?)
        processGetUserMedia(this.data.getUserMedia, this.container);

        this.dispatchEvent(new Event('processed-getusermedia'));
    }

    importUpdatesAndStats() {
        for (let connectionId in this.data.PeerConnections) {
            const container = createContainers(connectionId, this.data.PeerConnections[connectionId].url, this.containers);
            this.container.appendChild(container);
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
                break;
            }
        }
        setTimeout(this.processConnections.bind(this), 0, Object.keys(this.data.PeerConnections));
    }

    processConnections(connectionIds) {
        const connectionId = connectionIds.shift();
        if (!connectionId) return;
        setTimeout(this.processStats.bind(this), 0, connectionId);
        setTimeout(this.processConnections.bind(this), 0, connectionIds)

        const peerConnectionTrace = this.data.PeerConnections[connectionId];
        const container = this.containers[connectionId];

        // Display the updateLog
        this.containers[connectionId].url.innerText = 'Origin: ' + peerConnectionTrace.url;
        this.containers[connectionId].configuration.innerText = 'Configuration: ' + JSON.stringify(peerConnectionTrace.rtcConfiguration, null, ' ') + '\n';
        if (peerConnectionTrace.constraints) {
            this.containers[connectionId].configuration.innerText += 'Legacy (chrome) constraints: ' + JSON.stringify(peerConnectionTrace.constraints, null, ' ');
        }

        this._showStateChanges(connectionId);

        const state = {};
        for (const traceEvent of peerConnectionTrace.updateLog) {
            const row = this._processTraceEvent(traceEvent, state);
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
        }

        const ev = new Event('processed-peerconnection');
        ev.connectionId = connectionId;
        this.dispatchEvent(ev);
    }

    processStats(connectionId) {
        const peerConnectionTrace = this.data.PeerConnections[connectionId];
        const referenceTime = document.getElementById('useReferenceTime').checked && peerConnectionTrace.updateLog.length
            ? new Date(peerConnectionTrace.updateLog[0].time).getTime()
            : undefined;
        this.graphs[connectionId] = {};

        const reportobj = createInternalsTimeSeries(peerConnectionTrace);
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
                'mid', 'rid', 'encodingIndex',
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

        const ev = new Event('processed-stats');
        ev.connectionId = connectionId;
        this.dispatchEvent(ev);
    }

    _showStateChanges(connectionId) {
        // update state displays
        const peerConnectionTrace = this.data.PeerConnections[connectionId];
        let hadEvent = false;
        for (const traceEvent of peerConnectionTrace.updateLog) {
            // FIXME: would be cool if a click on this would jump to the table row
            if (traceEvent.type === 'iceconnectionstatechange') {
                this.containers[connectionId].iceConnectionState.textContent += ' => ' + traceEvent.value;
                hadEvent = true;
            } else if (traceEvent.type === 'connectionstatechange') {
                this.containers[connectionId].connectionState.textContent += ' => ' + traceEvent.value;
                hadEvent = true;
            } else if (traceEvent.type === 'signalingstatechange') {
                this.containers[connectionId].signalingState.textContent += ' => ' + traceEvent.value;
                hadEvent = true;
            }
        }
        if (!hadEvent) {
            this.containers[connectionId].iceConnectionState.style.display = 'none';
            this.containers[connectionId].connectionState.style.display = 'none';
            this.containers[connectionId].signalingState.style.display = 'none';
        }
    }

    _processTraceEvent(traceEvent, state) {
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

        if (['іcecandidate', 'addIceCandidate'].includes(traceEvent.type) && traceEvent.value) {
            const toShow = [];
            if (traceEvent.value.startsWith('{')) {
                const parts = JSON.parse(traceEvent.value);
                ['sdpMid', 'sdpMLineIndex'].forEach(property => {
                    toShow.push(property + ': ' + parts[property]);
                });
                if (parts.candidate) {
                    const candidate = SDPUtils.parseCandidate(parts.candidate.trim());
                    if (candidate) {
                        toShow.push('port:' + candidate.port);
                        toShow.push('type: ' + candidate.type);
                    }
                }
                if (parts.relayProtocol) {
                    toShow.push('relayProtocol: ' + parts.relayProtocol);
                }
            } else {
                const parts = traceEvent.value.split(', ')
                    .map(part => part.split(': '));
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
            }
            el.innerText += ' (' + toShow.join(', ') + ')';
        }
        if (traceEvent.value.startsWith('{"type":') || traceEvent.value.indexOf(', sdp: ') != -1) {
            let type;
            let sdp;
            if (traceEvent.value.startsWith('{"type":')) {
                const result = JSON.parse(traceEvent.value);
                type = result.type;
                sdp = result.sdp;
            } else { // legacy format.
                const result = traceEvent.value.substr(6).split(', sdp: ');
                type = result[0];
                sdp = result[1];
            }
            let last_sections;
            let remote_sections;
            if (traceEvent.type === 'setLocalDescription') {
                const lastCreated = type === 'offer' ? state.lastCreatedOffer : state.lastCreatedAnswer;
                if ((type === 'offer' && state.lastCreatedOffer) || (type === 'answer' && state.lastCreatedAnswer)) {
                    let last_type;
                    let last_sdp;
                    const lastDescription = (type === 'offer' ? state.lastCreatedOffer : state.lastCreatedAnswer);
                    if (lastDescription.startsWith('{"type":')) {
                        const result = JSON.parse(lastDescription);
                        last_type = result.type;
                        last_sdp = result.sdp;
                    } else {
                        const result = lastDescription.substr(6).split(', sdp: ');
                        last_type = result[0];
                        last_sdp = result[1];
                    }
                    if (sdp != last_sdp) {
                        last_sections = SDPUtils.splitSections(last_sdp);
                        details.open = true;
                    }
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
    const series = {};
    for (let reportname in connection.stats) {
        if (reportname.startsWith('Conn-')) {
            return {}; // legacy stats, no longer supported. Warning is shown above.
        }
    }
    for (let reportname in connection.stats) {
        // special casing of computed stats, in particular [a-b]
        let statsId;
        let statsProperty;
        if (reportname.indexOf('[') !== -1) {
            const t = reportname.split('[');
            statsProperty = '[' + t.pop();
            statsId = t.join('');
            statsId = statsId.substr(0, statsId.length - 1);
        } else {
            const t = reportname.split('-');
            statsProperty = t.pop();
            statsId = t.join('-');
        }
        const stats = connection.stats[reportname];

        if (!series.hasOwnProperty(statsId)) {
            series[statsId] = [];
            series[statsId].type = stats.statsType;
            series[statsId].startTime = new Date(stats.startTime).getTime();
            series[statsId].endTime = new Date(stats.endTime).getTime();
        }
        let values = JSON.parse(stats.values);
        // Individual timestamps were added in crbug.com/1462567 in M117.
        if (connection.stats[statsId + '-timestamp']) {
            const timestamps = JSON.parse(connection.stats[statsId + '-timestamp'].values);
            values = values.map((currentValue, index) => [timestamps[index], currentValue]);
        } else {
            // Fallback to the assumption that stats were gathered every second.
            values = values.map((currentValue, index) => [series[statsId].startTime + 1000 * index, currentValue]);
        }
        series[statsId].push([statsProperty, values]);
    }
    return series;
}


