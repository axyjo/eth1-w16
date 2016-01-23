var net = require('net'), _ = require('underscore');

var client = new net.Socket();
client.connect(25000, 'production', function () {
    console.log('connected');
    var hello = {"type": "hello", "team": "DRESDEN"}
    sendMessage(hello);
});

var positions = {};
var books = {};
var trades = {};
var qtys = {XLF: 0, BOND: 0, GS: 0, MS: 0, WFC: 0};

var tradingOpen = {};

client.on('data', function(data) {
    var message = data.toString();
    var messageParts = message.split('\n');
    _.each(messageParts, function(part) {
        if (part) {
            var stuff = JSON.parse(part);
            doProcess(stuff);
        }
    });
});

client.on('error', function(err) {
    console.log(err);
    process.exit();
});

var sendMessage = function(message) {
    client.write(JSON.stringify(message));
    client.write("\n");
}

var addTrades = function(message) {
    if (!trades[message['symbol']]) {
        trades[message['symbol']] = [];
    }

    trades[message['symbol']].push(message["price"]);
    if (trades[message['symbol']].length > 150) {
        trades[message['symbol']].shift();
    }
}
var doProcess = function(message) {
    if (message["type"] == "book") {
        updateBooks(message);
    }

    if (message["type"] == "trade") {
        addTrades(message);
    }
    

    if (message["type"] == "reject") {
        console.log(message);
        if (message["error"] == "LIMIT:POSITION") {
            var origOrder = orders[message["order_id"]];
            //console.log("  -> ", origOrder);
            var dir = origOrder["dir"] == "BUY" ? "SELL" : "BUY";
            var fmv = getFMV(message["symbol"]);
            if (fmv) {
                var price = Math.floor(fmv);
                //sendOrder(origOrder["symbol"], dir, price, 6);
            }
        }
    }
    if (message["type"] == "ack") {
        orders[message["order_id"]]["status"] = "acked";
        var origOrder = orders[message["order_id"]];
        if (origOrder["type"] == "convert") {
            if (origOrder["symbol"] == "XLF") {
                if (origOrder["dir"] == "BUY") {
                    qtys["XLF"] += origOrder["size"];
                    qtys["BOND"] -= 3*origOrder["size"]/10;
                    qtys["GS"] -= 2*origOrder["size"]/10;
                    qtys["MS"] -= 3*origOrder["size"]/10;
                    qtys["WFC"] -= 2*origOrder["size"]/10;
                } else {
                    qtys["XLF"] -= origOrder["size"];
                    qtys["BOND"] += 3*origOrder["size"]/10;
                    qtys["GS"] += 2*origOrder["size"]/10;
                    qtys["MS"] += 3*origOrder["size"]/10;
                    qtys["WFC"] += 2*origOrder["size"]/10;
                }
            }
        }

    }

    if (message["type"] == "fill") {
        var qty = message["size"] * (message["dir"] == "SELL" ? -1 : 1);
        addPosition(message["symbol"], message["price"], qty)
    }

    if (message["type"] == "close") {
        _.each(message["symbols"], function(symbol) {
            tradingOpen[symbol] = false;
        });
    }
    if (message["type"] == "open") {
        _.each(message["symbols"], function(symbol) {
            tradingOpen[symbol] = true;
        });
    }
}

var updateBooks = function(message) {
    books[message["symbol"]] = {"buy": [], "sell": []};
    books[message["symbol"]]["buy"] = message["buy"];
    books[message["symbol"]]["sell"] = message["sell"];
}

var getFMV = function(symbol) {
    if (symbol == "BOND") return 1000;


    if (!trades[symbol] || trades[symbol].length < 25) return false;
    var prices = trades[symbol];
    prices = prices.sort();
    var half = Math.floor(prices.length / 2);
    if (prices.length % 2) {
        return prices[half];
    } else {
        return (prices[half-1] + prices[half])/2.0;
    }

}

var getFMV2 = function(symbol) {
    if (symbol == "BOND") return 1000;
    var buyValue = 0, buyCount = 0, sellCount = 0, sellValue = 0;
    if (books[symbol]) {
        _.each(books[symbol]["buy"], function(position) {
            buyValue += position[0] * position[1];
            buyCount += position[1];
        });
        _.each(books[symbol]["sell"], function(position) {
            sellValue += position[0] * position[1];
            sellCount += position[1];
        });
    }

    if (buyCount == 0 && sellCount == 0) {
        return false;    
    } else if (buyCount == 0) {
        return sellValue/sellCount;
    } else if (sellCount == 0) {
        return buyValue/buyCount;
    } else {
        return (buyValue/buyCount + sellValue/sellCount) / 2;
    }
}

var addPosition = function(symbol, price, qty) {
    console.log("Adding position", symbol, qty)
    if (!positions[symbol]) {
        positions[symbol] = []
    }

    positions[symbol].push([price, qty]);
    qtys[symbol] += qty;
}

var getAvgPrice = function(symbol) {
    var sum = 0;
    var count = 0;
    _.each(positions[symbol], function(position) {
        sum += position[0] * Math.abs(position[1]);
        count += position[1];
    });

    return count != 0 ? sum/count : 0;
}

var orders = [];
var sendOrder = function(symbol, dir, price, qty) {
    if (!tradingOpen[symbol]) return;
    var order = {"type": "add", "order_id": orders.length, "symbol": symbol, "dir": dir, "price": price, "size": qty, "status": "unacked"}
    orders.push(order);
    sendMessage(order);
    //console.log("ORDER", orders.length-1, ':', dir, qty, symbol, "@", price);
    return orders.length - 1;
}

var cancelOrder = function(orderId) {
    var order = {"type": "cancel", "order_id": orderId}
    sendMessage(order);
}

var getPosition = function(symbol)  {
    var sum = 0;
    var count = 0;
    _.each(positions[symbol], function(position) {
        sum += position[0] * Math.abs(position[1]);
        count += position[1];
    });

    return [count != 0 ? sum/count : 0, count];
}


setInterval(function() {
    _.each(stocks, function(symbol) {
        var position = getPosition(symbol);
        if (!position[1]) return;
        var qtyToTrade = Math.max(Math.abs(Math.floor(position[1]/2)), 10);
        var dir = position[1] < 0 ? 'BUY' : 'SELL';
        var price = Math.abs(Math.floor(position[0])) + (dir == 'BUY' ? -1 : 1); price = Math.floor(getFMV(symbol));
        if (price) sendOrder(symbol, dir, price, qtyToTrade);
    });
}, 1000000);

var stocks = ["BOND", "GS", "MS", "WFC", "XLF"]
var pennyingOrders = {};
// Pennying
setInterval(function() {
    _.each(stocks, function(stock) {
        if (!getFMV(stock)) return;
        if (!pennyingOrders[stock]) {
            pennyingOrders[stock] = {buy: null, sell: null};
        }

        _.each(pennyingOrders[stock], function(orderId) {
            if (orderId) cancelOrder(orderId);
        });

        try {
            var buyPrice = books[stock]["buy"][0][0];
            var sellPrice = books[stock]["sell"][0][0];
            var position = getPosition(stock)
            var qty = Math.min(10, books[stock]["sell"][0][1], books[stock]["buy"][0][1], Math.abs(50-position[1]));
            if (Math.abs(sellPrice - buyPrice) >= 1 && qty) {
                pennyingOrders[stock]["buy"] = sendOrder(stock, "BUY", buyPrice, qty);
                pennyingOrders[stock]["sell"] = sendOrder(stock, "SELL", sellPrice, qty);
            }
        } catch (e) {}
    });
}, 5000);


// convert inefficiency XLF
setInterval(function() {
  // What are people willing to buy 
  var xlf = getBuyPrice("XLF");
  var bond = getBuyPrice("BOND");
  var gs = getBuyPrice("GS");
  var ms = getBuyPrice("MS");
  var wfc = getBuyPrice("WFC");
 
  if (!xlf || !bond || !gs || !ms || !wfc) return;

  var xlfBasket = 10*xlf
  var stockBasket = 3*bond + 2*gs + 3*ms + 2*wfc;

  var difference = stockBasket - xlfBasket;
  
  console.log("XLF position", qtys);
  // make sure it's actually worth it first.

  if (qtys["XLF"] != 0) {
      var dir = qtys["XLF"] < 0 ? "BUY" : "SELL";
      sendOrder("XLF", dir, xlf, 10);
      qtys["XLF"] += 10 * (dir == "BUY" ? 1 : -1);
  }

  if (Math.abs(difference) <= 200) {
    console.log("NOT WORTH");
    return;

  }
  // positive if basket is bigger (basket's buy value is greater)
  if (difference > 0 && qtys["XLF"] > -100 ) {
      // sell-convert some ETFs to convert to the basket.
      convert("XLF", "SELL", 10);
      sendOrder("BOND", "SELL", bond, 3);
      sendOrder("GS", "SELL", gs, 2);
      sendOrder("MS", "SELL", ms, 3);
      sendOrder("WFC", "SELL", wfc, 2);
      console.log("Buying baskets", difference)
  } else if (difference < 0 && qtys["XLF"] < 100) {
    // buy-convert some ETFs to convert to the ETF
      convert("XLF", "BUY", 10);
      sendOrder("BOND", "BUY", bond, 3);
      sendOrder("GS", "BUY", gs, 2);
      sendOrder("MS", "BUY", ms, 3);
      sendOrder("WFC", "BUY", wfc, 2);
      console.log("selling baskets", difference)
  }
}, 100);

var convert = function(symbol, dir, qty) {
    if (!tradingOpen[symbol]) return;
    var order = {"type": "convert", "order_id": orders.length, "symbol": symbol, "dir": dir, "size": qty, "status": "unacked"}
    orders.push(order);
    sendMessage(order);
    return orders.length - 1;
};

var getBuyPrice = function(symbol) {
    if (!trades[symbol] || trades[symbol].length < 5) return;
    try {
        return books[symbol]["buy"][0][0];
    } catch (e) {
        return false;
    }
}
