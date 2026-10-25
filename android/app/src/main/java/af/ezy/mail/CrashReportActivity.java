package af.ezy.mail;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;

/**
 * Diagnostic screen that displays the saved crash report.
 *
 * Runs in the separate ":crash" process so it keeps rendering after the main
 * process dies. Built 100% programmatically (no layout resource) so it cannot
 * itself fail on resource inflation. The owner photographs this screen.
 */
public class CrashReportActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.WHITE);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        root.setPadding(pad, pad, pad, pad);

        TextView title = new TextView(this);
        title.setText("EzyMail crash report\nPhotograph this screen and send it");
        title.setTextColor(Color.rgb(217, 48, 37));
        title.setTextSize(16);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setPadding(0, 0, 0, pad);

        TextView text = new TextView(this);
        text.setTypeface(Typeface.MONOSPACE);
        text.setTextSize(11);
        text.setTextColor(Color.BLACK);
        text.setTextIsSelectable(true);
        text.setText(readReport());

        ScrollView scroll = new ScrollView(this);
        scroll.addView(text);

        Button close = new Button(this);
        close.setText("Close");
        close.setOnClickListener((View v) -> {
            finish();
            android.os.Process.killProcess(android.os.Process.myPid());
        });

        root.addView(title);
        root.addView(scroll, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        root.addView(close);

        setContentView(root);
    }

    private String readReport() {
        StringBuilder sb = new StringBuilder();
        try {
            File file = new File(getFilesDir(), "crash-report.txt");
            BufferedReader reader = new BufferedReader(new FileReader(file));
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append('\n');
            }
            reader.close();
            if (sb.length() == 0) {
                sb.append("(report file is empty)");
            }
        } catch (Throwable t) {
            sb.append("Could not read crash report: ").append(t);
        }
        return sb.toString();
    }
}
