import {WebRTCInternalsDumpImporter} from './import.js';

const container = document.getElementById('tables');
document.getElementById('import').onchange = async (evt) => {
    evt.target.disabled = 'disabled';
    document.getElementById('useReferenceTime').disabled = true;

    const files = evt.target.files;
    const file = files[0];
    let stream;
    if (file.type === 'application/gzip') {
        stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
    } else {
        stream = file.stream();
    }
    const blob = await (new Response(stream)).blob();
    window.importer = new WebRTCInternalsDumpImporter(container);
    importer.process(await blob.text());
}

