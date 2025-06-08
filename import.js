import {createContainers, processGetUserMedia, createCandidateTable} from './import-common.js';

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
        const sections = SDPUtils.splitSections(sdp);
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

        el.innerText += ' (type: "' + type + '", ' + sections.length + ' sections)';
        if (last_sections) {
            el.innerText += ' munged';
            el.style.backgroundColor = '#FBCEB1';
        }
        const copyBtn = document.createElement('button');
        copyBtn.innerText = '\uD83D\uDCCB'; // clipboard
        copyBtn.className = 'copyBtn';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(JSON.stringify({type, sdp}));
        };
        el.appendChild(copyBtn);

        el = document.createElement('pre');
        sections.forEach((section, index) => {
            const lines = SDPUtils.splitLines(section);
            const mid = SDPUtils.getMid(section);
            const direction = SDPUtils.getDirection(section, sections[0]);

            const details = document.createElement('details');
            // Fold by default for large SDP.
            details.open = sections.length < 10 && direction !== 'inactive';
            details.innerText = section;

            const summary = document.createElement('summary');
            summary.innerText = lines[0] +
                ' (' + (lines.length - 1) + ' more lines)' +
                (mid ? ' mid=' + mid : '');
            if (lines[0].startsWith('m=')) {
                summary.innerText += ' direction=' + direction;
                const is_rejected = SDPUtils.parseMLine(lines[0]).port === 0;
                if (is_rejected) {
                    summary.innerText += ' rejected';
                    const was_rejected = remote_sections && remote_sections[index] &&
                        SDPUtils.parseMLine(remote_sections[index]).port === 0;
                    if (['createOffer', 'createAnswer', 'setLocalDescription'].includes(event.type)) {
                        summary.style.backgroundColor = '#ddd';
                    }
                    details.open = false;
                }
                if (last_sections && last_sections[index] !== sections[index]) {
                    // Ignore triggering from simple reordering which is ok-ish.
                    const last_lines = SDPUtils.splitLines(last_sections[index]).sort();
                    const current_lines = SDPUtils.splitLines(sections[index]).sort();
                    if (last_lines.findIndex((line, index) => line !== current_lines[index]) !== -1) {
                        summary.innerText += ' munged';
                        summary.style.backgroundColor = '#FBCEB1';
                        details.open = true;
                    } else {
                        summary.innerText += ' reordered';
                    }
                }
            }
            details.appendChild(summary);
            el.appendChild(details);
        });
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
    const referenceTime = connection.updateLog.length
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

        const series = [];
        series.statsType = statsType;
        const plotBands = [];
        reports.sort().forEach(report => {
            const [name, data, statsType] = report;
            if (name === 'kind' || name === 'mediaType') {
                series.kind = data[0][1];
            }
            if (name === 'trackIdentifier') {
                series.trackIdentifier = data[0][1];
            }
            if (name === 'ssrc') {
                series.ssrc = data[0][1];
            }
            if (name === 'label') { // for datachannels.
                series.label = data[0][1];
            }
            if (name === 'active' && statsType === 'outbound-rtp') {
                // set up a x-axis plotbands:
                // https://www.highcharts.com/docs/chart-concepts/plot-bands-and-plot-lines
                data.filter((el, index, values) => {
                    return !(index > 0 && index < values.length - 1 && values[index - 1][1] == el[1]);
                }).forEach((item, index, values) => {
                    if (item[1] === true) {
                        return;
                    }
                    plotBands.push({
                        from: item[0],
                        to: (values[index + 1] || [])[0],
                        label: {
                            align: 'center',
                            text: 'sender disabled',
                        },
                    });
                });
                return;
            }
            if (name === 'qualityLimitationReason' && statsType === 'outbound-rtp') {
                // set up a x-axis plotbands:
                // https://www.highcharts.com/docs/chart-concepts/plot-bands-and-plot-lines
                data.filter((el, index, values) => {
                    return !(index > 0 && index < values.length - 1 && values[index - 1][1] == el[1]);
                }).forEach((item, index, values) => {
                    if (item[1] === 'none') {
                        return;
                    }
                    plotBands.push({
                        from: item[0],
                        to: (values[index + 1] || [])[0],
                        label: {
                            align: 'center',
                            text: item[1] + '-limited',
                        },
                    });
                });
                return;
            }
            if (['encoderImplementation', 'decoderImplementation'].includes(name) && ['inbound-rtp', 'outbound-rtp'].includes(statsType)) {
                // set up a x-axis plotbands:
                // https://www.highcharts.com/docs/chart-concepts/plot-bands-and-plot-lines
                data.filter((el, index, values) => {
                    return !(index > 0 && index < values.length - 1 && values[index - 1][1] == el[1]);
                }).forEach((item, index, values) => {
                    plotBands.push({
                        from: item[0],
                        to: (values[index + 1] || [])[0],
                        label: {
                            align: 'left',
                            text: name + ': ' + item[1],
                        },
                        color: index % 2 === 0 ? 'white' : 'rgba(253, 253, 222, 0.3)',
                    });
                });
                return;
            }
            if (name === 'scalabilityMode' && statsType === 'outbound-rtp') {
                // set up a x-axis plotbands:
                // https://www.highcharts.com/docs/chart-concepts/plot-bands-and-plot-lines
                data.filter((el, index, values) => {
                    return !(index > 0 && index < values.length - 1 && values[index - 1][1] == el[1]);
                }).forEach((item, index, values) => {
                    plotBands.push({
                        from: item[0],
                        to: (values[index + 1] || [])[0],
                        label: {
                            align: 'right',
                            text: name + ': ' + item[1],
                            y: 30,
                        },
                        // This one is fully transparent (white with 100% alpha) since it overlaps with encoderImplementation.
                        color: (255, 255, 255, 1),
                        // But has a 1px border so it is possible to see changes unrelated to codec switches.
                        borderWidth: 1,
                        borderColor: 'rgba(189, 189, 189, 0.3)',
                    });
                });
                return;
            }

            const statsForLabels = [
                'mid', 'rid',
                'ssrc', 'rtxSsrc', 'fecSsrc',
                'encoderImplementation', 'decoderImplementation', 'scalabilityMode',
                'scalabilityMode', '[codec]',
                'label', // for datachannels
            ];
            if (statsForLabels.includes(name)) {
                series[name] = data[0][1];
            }
            series.id = reportname;

            if (typeof(data[0][1]) !== 'number') return;
            const ignoredSeries = [
                'timestamp',
                'protocol', 'dataChannelIdentifier',
                'streamIdentifier', 'trackIdentifier',
                'priority', 'port',
                'ssrc', 'rtxSsrc', 'fecSsrc',
                'mid', 'rid',
            ];
            if (ignoredSeries.includes(name)) {
                return;
            }

            const hiddenSeries = [
                'bytesReceived', 'bytesSent',
                'headerBytesReceived', 'headerBytesSent',
                'packetsReceived', 'packetsSent',
                'qpSum',
                'framesEncoded', 'framesDecoded', 'totalEncodeTime',
                'lastPacketReceivedTimestamp', 'lastPacketSentTimestamp',
                'remoteTimestamp', 'estimatedPlayoutTimestamp',
                'audioInputLevel', 'audioOutputLevel',
                'totalSamplesDuration', 'totalSamplesReceived',
                'jitterBufferEmittedCount',
            ];
            const secondYAxis = [
                // candidate-pair
                'consentRequestsSent', 'requestsSent', 'requestsReceived', 'responsesSent', 'responsesReceived',
                // data-channel
                '[messagesReceived/s]', '[messagesSent/s]',
                // inbound-rtp
                '[framesReceived/s]', '[framesDecoded/s]', '[keyFramesDecoded/s]', 'frameWidth', 'frameHeight',
                // outbound-rtp'
                '[framesSent/s]', '[framesEncoded/s]', '[keyFramesEncoded/s]', 'frameWidth', 'frameHeight',
            ];

            series.push({
                name,
                data,
                visible: !hiddenSeries.includes(name),
                yAxis: secondYAxis.includes(name) ? 1 : 0,
            });
        });

        // Optionally start all graphs at the same point in time.
        if (document.getElementById('useReferenceTime').checked && referenceTime !== undefined) {
            series
                .filter(s => s.data[0].length)
                .map(s => {
                    console.log(s.name, s.data);
                    if (s.data[0] !== referenceTime) {
                        s.data.unshift([referenceTime, undefined]);
                    }
                });
        }

        // TODO: it would be nice to sort the graphs such that same mids go together.
        if (series.length > 0) {
            const container = document.createElement('details');
            if (series.statsType) {
                container.attributes['data-statsType'] = series.statsType;
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
            ].filter(key => series[key] !== undefined)
                .map(key => {
                    return ({statsType: 'type', trackIdentifier: 'track'}[key] || key) + '=' + JSON.stringify(series[key]);
                }).join(', ');
            const titleElement = document.createElement('summary');
            titleElement.innerText = title;
            container.appendChild(titleElement);

            const d = document.createElement('div');
            d.id = 'chart_' + Date.now();
            d.classList.add('graph');
            container.appendChild(d);
            const graph = new Highcharts.Chart({
                title: {
                    text: null
                },
                xAxis: {
                    type: 'datetime',
                    plotBands,
                },
                yAxis: [{
                    min: series.kind ? 0 : undefined
                },
                {
                    min: series.kind ? 0 : undefined
                },
                ],
                chart: {
                    zoomType: 'x',
                    renderTo : d.id,
                },
                series,
            });
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
        }
    });
}

function filterStatsGraphs(event, container) {
    const filter =  event.target.value;
    const filters = filter.split(',');
    container.childNodes.forEach(node => {
        if (node.nodeName !== 'DETAILS') {
            return;
        }
        const statsType = node.attributes['data-statsType'];
        if (!filter || filters.includes(statsType) ||
            filters.find(f => statsType.includes(f))) {
            node.style.display = 'block';
        } else {
            node.style.display = 'none';
        }
    });
}
