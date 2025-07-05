import {WebRTCInternalsDumpImporter} from './import.js';

const container = document.getElementById('tables');
document.getElementById('import').onchange = function(evt) {
    evt.target.disabled = 'disabled';
    const files = evt.target.files;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (function(file) {
        return function(e) {
            let result = e.target.result;
            if (typeof result === 'object') {
                result = pako.inflate(result, {to: 'string'});
            }
            window.importer = new WebRTCInternalsDumpImporter(container);
            importer.process(result);
        };
    })(file);
    if (file.type === 'application/gzip') {
        reader.readAsArrayBuffer(files[0]);
    } else {
        reader.readAsText(files[0]);
    }
}
