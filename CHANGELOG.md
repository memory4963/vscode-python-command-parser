# Change Log

All notable changes to the "python-command-parser" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.3] - 2026-07-06

### Added
- **Multi-line command support** - Handle backslash line continuations for better readability
  - Example:
    ```
    python main.py \
      --arg1 xxx \
      --arg2 xxx
    ```
- **Custom Python interpreter paths** - Support for virtual environment and custom Python paths
  - Supports: `python`, `python3`, `.venv/bin/python`, `/usr/bin/python3.9`, etc.
  - Example: `CUDA_VISIBLE_DEVICES=1,2 .venv/bin/python main.py --arg1`
- **Quote-aware argument parsing** - Properly handle quoted arguments with spaces
  - Example: `python main.py --arg "value with spaces"`

### Fixed
- Remove trailing backslashes from line continuations to prevent empty string arguments
- Filter out empty arguments in multi-line commands

## [0.0.2]

- Initial release
