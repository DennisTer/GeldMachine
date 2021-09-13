//////////   CALCULATIING THE RSI ( RELATIVE STRENGHT INDEX ) for all the coins
    //// period = longSMA period
    var upmoves = []
    var downmoves = []
    if ( allCoins[i][1].length < (smaLongPeriod + 1) ) { var RSIperiodeIndex = 0 }
    if ( allCoins[i][1].length >= (smaLongPeriod + 1) ) { var RSIperiodeIndex = allCoins[i][1].length-200 }
    for (let e = RSIperiodeIndex; e < allCoins[i][1].length; e++) {
      var upchange = allCoins[i][1][allCoins[i][1][e]] - allCoins[i][1][allCoins[i][1][e-1]]
      if ( upchange >= 0) {
      upmoves.push(upchange)
      downmoves.push(0)
      } else { 
        downmoves.push(upchange)
        upmoves.push(0)
      }
    }
      var AVGU = sma(upmoves,smaLongPeriod,format)
      var AVGD = sma(downmoves,smaLongPeriod,format)
      var RS = AVGU / AVGD
      var RSI = 100 - (100 / ( 1 + RS))
      allCoins[i][12] = parseFloat(RSI)