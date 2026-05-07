from flask import Blueprint, redirect, render_template


web_bp = Blueprint("web", __name__)


@web_bp.route("/")
def index():
    return redirect("/app")


@web_bp.route("/app")
def app_page():
    return render_template("client.html")


@web_bp.route("/admin")
def admin_page():
    return render_template("admin.html")
