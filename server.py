#!/usr/bin/python
from __future__ import print_function

import sys
import socket

positions = dict()
unacked_orders = dict()
acked_orders = dict()
orders_acked = dict()
order_ids = 0

def connect():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.connect(("test-exch-dresden", 20000))
    return s.makefile('w+', 1)

def main():
    exchange = connect()
    print("HELLO DRESDEN", file=exchange)
    msg = exchange.readline().strip()
    while (True):
        print("EXCH:", msg, file=sys.stderr)
        if msg.startswith("BOOK BOND"):
          order_book = msg.split(" ")
            
          add_order(exchange, "BOND", "BUY", )
        msg = exchange.readline().strip()

def add_order(e, symbol, dir, price, qty):
  order_ids = order_ids + 1
  print("ADD ", order_ids, " ", symbol, " ", dir, " ", price, " ", qty, file=e)
  orders_acked[order_ids] = False
  return order_ids




if __name__ == "__main__":
    main()

