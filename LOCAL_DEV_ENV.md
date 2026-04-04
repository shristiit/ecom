ssh -i ~/downloads/stockaislekeyFBND.pem \
  -L 5433:ecom-db.c6tik80wsqeb.us-east-1.rds.amazonaws.com:5432 \
  ubuntu@54.205.249.82

Run this in a separate terminal and keep it open while running the apps.

Replace `~/downloads/stockaislekeyFBND.pem` with the local path to your PEM key.

  
