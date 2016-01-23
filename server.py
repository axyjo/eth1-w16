#!/usr/bin/python
from __future__ import print_function

import sys
import socket

positions = dict()
orders = []

def connect():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(("test-exch-dresden", 20000))
    return s.makefile('w+', 1)

def main():
    exchange = connect()
    print("HELLO TEAMNAME", file=exchange)
    while (msg = exchange.readline().strip()):
        print("The exchange replied:", msg, file=sys.stderr)

if __name__ == "__main__":
    main()

