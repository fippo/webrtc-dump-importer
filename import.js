import {createContainers, processGetUserMedia, createCandidateTable, processDescriptionEvent, createGraphOptions} from './import-common.js';

const SDPUtils = window.adapter.sdp;

document.getElementById('import').onchange = function(evt) {
    evt.target.disabled = true;
    document.getElementById('useReferenceTime').disabled = true;

    const files = evt.target.files;
    const reader = new FileReader();
    reader.onload = ((file) => {
        return (e) => {
            let result = e.target.result;
            if (typeof result === 'object') {
                result = pako.inflate(result, {to: 'string'});
            }
            const theLog = JSON.parse(result);
            importUpdatesAndStats(theLog);
        };
    })(files[0]);
    if (files[0].type === 'application/gzip') {
        reader.readAsArrayBuffer(files[0]);
    } else {
        reader.readAsText(files[0]);
    }
}

function processTraceEvent(event, state) {
    const row = document.createElement('tr');
    let el = document.createElement('td');
    el.setAttribute('nowrap', '');
    el.innerText = event.time;
    row.appendChild(el);

    // recreate the HTML of webrtc-internals
    const details = document.createElement('details');
    el = document.createElement('summary');
    el.innerText = event.type;
    details.appendChild(el);

    if (event.type === 'icecandidate' || event.type === 'addIceCandidate') {
        if (event.value) {
            const parts = event.value.split(', ')
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
    if (event.value.indexOf(', sdp: ') != -1) {
        const [type, sdp] = event.value.substr(6).split(', sdp: ');
        let last_sections;
        let remote_sections;
        if (event.type === 'setLocalDescription') {
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
        processDescriptionEvent(el, event.type, {type, sdp}, last_sections, remote_sections);
    } else {
        el = document.createElement('pre');
        el.innerText = event.value;
    }
    details.appendChild(el);
    el = document.createElement('td');
    if (event.value !== '') {
        el.appendChild(details);
    } else {
        el.innerText = event.type;
    }
    row.appendChild(el);

    // If the event type ends with 'Failure' hightlight it
    if (event.type.endsWith('Failure')) {
        row.style.backgroundColor = 'red';
    }
    // Likewise, highlight (ice)connectionstates.
    if (['iceconnectionstatechange', 'connectionstatechange'].includes(event.type)) {
        switch(event.value) {
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

const graphs = {};
const containers = {};
window.graphs = graphs;
window.containers = containers;
function importUpdatesAndStats(data) {
    if (data.UserAgentData && data.UserAgentData.length >= 2) {
        document.getElementById('userAgent').innerText +=
            data.UserAgentData[2].brand + ' ' +
            data.UserAgentData[1].version + ' / ' ;
    }
    document.getElementById('userAgent').innerText += data.UserAgent;
    document.getElementById('tables').style.display = 'block';

    // FIXME: also display GUM calls (can they be correlated to addStream?)
    processGetUserMedia(data.getUserMedia, document.getElementById('tables'));

    // first, display the updateLog
    for (let connid in data.PeerConnections) {
        const connection = data.PeerConnections[connid];
        const container = createContainers(connid, connection.url, containers);

        containers[connid].url.innerText = 'Origin: ' + connection.url;
        containers[connid].configuration.innerText = 'Configuration: ' + JSON.stringify(connection.rtcConfiguration, null, ' ') + '\n';
        containers[connid].configuration.innerText += 'Legacy (chrome) constraints: ' + JSON.stringify(connection.constraints, null, ' ');

        document.getElementById('tables').appendChild(container);
        const state = {};
        connection.updateLog.forEach(event => {
            containers[connid].updateLog.appendChild(processTraceEvent(event, state));
            if (event.type === 'createOfferOnSuccess') {
                state.lastCreatedOffer = event.value;
            } else if (event.type === 'createAnswerOnSuccess') {
                state.lastCreatedAnswer = event.value;
            } else if (event.type === 'setLocalDescription') {
                state.lastCreatedOffer = undefined;
                state.lastCreatedAnswer = undefined;
            } else if (event.type === 'setRemoteDescription') {
                state.lastRemoteDescription = event.value;
            } else if (event.type == 'signalingstatechange' && event.value === 'stable') {
                state.lastRemoteDescription = undefined;
            }
        });
        connection.updateLog.forEach(event => {
            // update state displays
            if (event.type === 'iceconnectionstatechange') {
                containers[connid].iceConnectionState.textContent += ' => ' + event.value;
            }
            if (event.type === 'connectionstatechange') {
                containers[connid].connectionState.textContent += ' => ' + event.value;
            }
        });
        connection.updateLog.forEach(event => {
            // FIXME: would be cool if a click on this would jump to the table row
            if (event.type === 'signalingstatechange') {
                containers[connid].signalingState.textContent += ' => ' + event.value;
            }
        });
        let legacy = false;
        for (let reportname in connection.stats) {
            if (reportname.startsWith('Conn-')) {
                legacy = true;
                break;
            }
        }
        if (!legacy) {
            createCandidateTable(connection.stats, containers[connid].candidates);
        } else {
            document.getElementById('legacy').style.display = 'block';
        }
    }
    // then, update the stats displays
    processConnections(Object.keys(data.PeerConnections), data);
}

function processConnections(connectionIds, data) {
    const connid = connectionIds.shift();
    if (!connid) return;
    window.setTimeout(processConnections, 0, connectionIds, data);

    const connection = data.PeerConnections[connid];
    const referenceTime = document.getElementById('useReferenceTime').checked && connection.updateLog.length
        ? new Date(connection.updateLog[0].time).getTime()
        : undefined;
    graphs[connid] = {};
    const reportobj = {};
    let values;

    for (let reportname in connection.stats) {
        if (reportname.startsWith('Conn-')) {
            return; // legacy stats, no longer supported. Warning is shown above.
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
        }
        values = JSON.parse(connection.stats[reportname].values);
        const startTime = new Date(connection.stats[reportname].startTime).getTime();
        const endTime = new Date(connection.stats[reportname].endTime).getTime();
        // Individual timestamps were added in crbug.com/1462567 in M117.
        if (connection.stats[stat + '-timestamp']) {
            const timestamps = JSON.parse(connection.stats[stat + '-timestamp'].values);
            values = values.map((currentValue, index) => [timestamps[index], currentValue]);
        } else {
            // Fallback to the assumption that stats were gathered every second.
            values = values.map((currentValue, index) => [startTime + 1000 * index, currentValue]);
        }
        reportobj[stat].push([comp, values, connection.stats[reportname].statsType]);
    }

    Object.keys(reportobj).forEach(reportname => {
        const reports = reportobj[reportname];
        const statsType = reports[0][2];
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
        containers[connid].graphs.appendChild(container);
        // TODO: keep in sync with
        // https://source.chromium.org/chromium/chromium/src/+/main:content/browser/webrtc/resources/stats_helper.js
        const title = [
            'statsType', 'kind',
            'ssrc', 'rtxSsrc', 'fecSsrc',
            'mid', 'rid',
            'label',
            '[codec]',
            'encoderImplementation', 'decoderImplementation',
            'trackIdentifier',
            'id',
        ].filter(key => graphOptions.series[key] !== undefined)
            .map(key => {
                return ({statsType: 'type', trackIdentifier: 'track'}[key] || key) + '=' + JSON.stringify(graphOptions.series[key]);
            }).join(', ');

        const titleElement = document.createElement('summary');
        titleElement.innerText = title;
        container.appendChild(titleElement);

        const d = document.createElement('div');
        d.id = 'chart_' + Date.now();
        d.classList.add('graph');
        container.appendChild(d);

        const graph = new Highcharts.Chart(d, graphOptions);
        graphs[connid][reportname] = graph;

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

