"""Entry point: ``python -m paper_factory`` / the ``paper-factory`` console script."""

from __future__ import annotations

import sys


def main() -> int:
    from PySide6.QtWidgets import QApplication

    from .db import Store
    from .ui.main_window import MainWindow

    app = QApplication(sys.argv)
    store = Store()
    window = MainWindow(store)
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
