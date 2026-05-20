from flask import Flask

from .routes.admin import admin_bp
from .routes.auth import auth_bp
from .routes.records import records_bp
from .routes.web import web_bp
from .services.core import ensure_runtime_schema_once, init_database, migrate_hospital_data_once


def create_app():
    app = Flask(__name__, template_folder="../templates", static_folder="../static")

    # Keep compatibility with existing config module.
    import config

    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["UPLOAD_FOLDER"] = config.UPLOAD_FOLDER

    ensure_runtime_schema_once()

    app.register_blueprint(web_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(records_bp)
    app.register_blueprint(admin_bp)

    @app.cli.command("init-db")
    def init_db_command():
        init_database()
        print("PICCO database initialized. Admin: admin / admin123")

    @app.cli.command("migrate-hospital")
    def migrate_hospital_command():
        changed = migrate_hospital_data_once()
        print(f"Hospital migration completed. owner_backfilled={changed}")

    return app
