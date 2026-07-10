> ⚠️ **Deprecated — do not use.**
> The maintained dump importer now lives in
> **[rtcstats/rtcstats](https://github.com/rtcstats/rtcstats)** under **`dump-importer/`**,
> and is hosted at **[rtcstats.github.io/rtcstats/dump-importer](https://rtcstats.github.io/rtcstats/dump-importer/)**.
> That version reads both `rtcstats` and `webrtc-internals` dump formats and is kept
> maintained. This repository is no longer updated.

## Import webrtc-internal dumps
Chrome webrtc-internals page is tremendously useful but lacks the ability to reimport the exported dumps.
This web page provides that functionality and is co-developed with the Chromium page.
It also uses a [better library for graphs](http://www.highcharts.com/) that adds the ability to zoom into regions of interest.

## What do all these parameters mean?

I teamed up with [Tsahi Levent-Levi](https://bloggeek.me/) to describe the parameters from webrtc-internals as a series of blog posts:
* [Everything you wanted to know about webrtc-internals and getStats](https://bloggeek.me/webrtc-internals/)

[See also the 2017 version of that](http://testrtc.com/webrtc-internals-parameters/).

## License
MIT

Note that the (awesome) Highcharts library used for plots may need a license. See http://shop.highsoft.com/faq/non-commercial
