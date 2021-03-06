#!/usr/bin/env python
import sys
import RPi.GPIO as GPIO

pin = int(sys.argv[1])

print('Enabling pullup resistor on PIN: ' + str(pin) )
GPIO.setmode(GPIO.BOARD)

GPIO.setup(pin, GPIO.IN, pull_up_down=GPIO.PUD_UP)


