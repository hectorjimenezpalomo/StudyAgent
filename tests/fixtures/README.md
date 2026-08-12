# Test fixtures

- `studyagent-demo-source.txt` is original, deterministic StudyAgent demo content.
- `studyagent-demo.pdf` is generated from that source with `npm run demo:fixture`.

The extraction test verifies several facts so a fixture regression cannot silently
turn the PDF into an image-only or otherwise unreadable document.
