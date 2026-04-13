all account password are 12345678

run front/backend: 
npm  i
npm run dev


run flask:
python -m venv venv
pip install -r "requirements.txt"
FLASK_APP=run.py flask run --port=5001 --host=0.0.0.0

or use docker compose for quick deploy

use pgadmin or postgre shell to run the backup_dump file
