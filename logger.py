import logging
import os
from logging.handlers import RotatingFileHandler

class LineRotatingFileHandler(RotatingFileHandler):
    def __init__(self, filename, mode='a', maxLines=1000, backupCount=5, encoding=None, delay=False):
        super().__init__(filename, mode, 0, backupCount, encoding, delay)
        self.maxLines = maxLines
        self.currentLineCount = 0

    def emit(self, record):
        if self.currentLineCount >= self.maxLines:
            self.doRollover()
            self.currentLineCount = 0

        super().emit(record)
        self.currentLineCount += 1

os.makedirs('log', exist_ok=True)

_logger = {}

def getLogger(name) -> logging.Logger:
    if name not in _logger:
        _logger[name] = logging.getLogger(name)
        _logger[name].setLevel(logging.DEBUG)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

        consoleHandler = logging.StreamHandler()
        consoleHandler.setLevel(logging.INFO)
        consoleHandler.setFormatter(formatter)
        _logger[name].addHandler(consoleHandler)

        fileHandler = LineRotatingFileHandler(f'log/{name}.log')
        fileHandler.setLevel(logging.DEBUG)
        fileHandler.setFormatter(formatter)
        _logger[name].addHandler(fileHandler)

    return _logger[name]