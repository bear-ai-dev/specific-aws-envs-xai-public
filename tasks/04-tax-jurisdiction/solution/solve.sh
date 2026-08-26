#!/bin/bash
# Reference solution: restores tax determination and jurisdiction resolution.
#
# Reinstates the tax collaborator that talks to the authority, the rate
# selection and transaction filing on the invoice entity, the VAT identity lines
# on both address blocks, and the wiring that carries the collaborator from the
# modules down to the payment processor.
set -euo pipefail

cd /app
patch -p1 --forward --batch < "$(dirname "$0")/solution.patch"
echo "tax determination restored"
