# HAVEN Browser Shield

A Manifest V3 browser shield that scans visible page text locally for high-risk scam patterns and sends only a compact event to `fn-browser-shield` when risk patterns are present.

It does not store raw pages and does not expose secrets in the extension package. Runtime configuration is stored in browser local extension storage after pairing with HAVEN.
