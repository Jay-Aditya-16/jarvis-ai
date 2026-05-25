%% Jarvis Benchmark Analysis
%  Run after: node benchmark/run.js
%  Loads benchmark/results.json and produces a full dashboard figure.

clear; clc; close all;

%% Load results
fid  = fopen(fullfile(fileparts(mfilename('fullpath')), 'results.json'), 'r');
raw  = fread(fid, '*char')';
fclose(fid);
data = jsondecode(raw);

fprintf('\n=== Jarvis Benchmark Results (%s) ===\n\n', data.timestamp);

%% ── Figure layout ─────────────────────────────────────────────────────────────
fig = figure('Name','Jarvis Benchmark Dashboard', ...
             'Position',[100 100 1400 900], ...
             'Color','#1a1a2e');

% Dark theme helpers
bg   = [0.10 0.10 0.18];
fg   = [0.92 0.92 0.95];
acc1 = [0.20 0.72 1.00];   % cyan
acc2 = [0.98 0.44 0.44];   % red
acc3 = [0.40 0.90 0.55];   % green
acc4 = [1.00 0.75 0.20];   % amber

set(fig, 'Color', bg);

%% ── 1. Overall gauge (top-left) ──────────────────────────────────────────────
ax1 = subplot(3,4,[1 2]);
set(ax1,'Color',bg,'XColor',fg,'YColor',fg); hold on;

overall = data.overall * 100;
theta   = linspace(pi, 0, 200);
plot(cos(theta), sin(theta), 'Color', [fg 0.2], 'LineWidth', 12);
theta_fill = linspace(pi, pi - (overall/100)*pi, 200);
plot(cos(theta_fill), sin(theta_fill), 'Color', acc3, 'LineWidth', 12);

text(0, 0.1,  sprintf('%.1f%%', overall), ...
     'HorizontalAlignment','center','FontSize',38,'Color',acc3,'FontWeight','bold');
text(0, -0.3, 'Overall Score', ...
     'HorizontalAlignment','center','FontSize',13,'Color',fg);

xlim([-1.3 1.3]); ylim([-0.5 1.2]);
axis off; title('Jarvis Benchmark', 'Color',fg,'FontSize',14,'FontWeight','bold');

%% ── 2. Per-component bar chart (top-right) ───────────────────────────────────
ax2 = subplot(3,4,[3 4]);
set(ax2,'Color',bg,'XColor',fg,'YColor',fg,'GridColor',[fg 0.15]); hold on;

components = {'Routing','Skills F1','RAG NDCG@3','Sentinel'};
scores     = [ data.routing.accuracy, data.skills.f1, ...
               data.rag.mean_ndcg,    data.sentinel.accuracy ] * 100;
colors     = [acc1; acc3; acc4; acc2];

for i = 1:4
    bar(i, scores(i), 'FaceColor', colors(i,:), 'EdgeColor','none', 'BarWidth',0.6);
    text(i, scores(i)+1.5, sprintf('%.1f%%', scores(i)), ...
         'HorizontalAlignment','center','FontSize',11,'Color',fg,'FontWeight','bold');
end

set(ax2,'XTick',1:4,'XTickLabel',components,'YLim',[0 110]);
ylabel('Score (%)', 'Color',fg); title('Component Scores','Color',fg,'FontWeight','bold');
grid on;

%% ── 3. Routing — per-role accuracy ──────────────────────────────────────────
ax3 = subplot(3,4,5);
set(ax3,'Color',bg,'XColor',fg,'YColor',fg); hold on;

roles      = fieldnames(data.routing.byRole);
role_accs  = cellfun(@(r) data.routing.byRole.(r).accuracy*100, roles);
role_tots  = cellfun(@(r) data.routing.byRole.(r).total, roles);

b = bar(role_accs,'FaceColor','flat','EdgeColor','none','BarWidth',0.65);
b.CData = repmat(acc1, numel(roles), 1);
set(ax3,'XTick',1:numel(roles),'XTickLabel',roles,'YLim',[0 115]);
for i=1:numel(roles)
    text(i, role_accs(i)+2, sprintf('%.0f%%\n(n=%d)', role_accs(i), role_tots(i)), ...
         'HorizontalAlignment','center','FontSize',9,'Color',fg);
end
title('Routing by Role','Color',fg,'FontWeight','bold');
ylabel('Accuracy (%)','Color',fg); grid on;

%% ── 4. Skills — precision / recall / F1 ─────────────────────────────────────
ax4 = subplot(3,4,6);
set(ax4,'Color',bg,'XColor',fg,'YColor',fg); hold on;

prec = data.skills.precision * 100;
rec  = data.skills.recall    * 100;
f1   = data.skills.f1        * 100;

b2 = bar([prec rec f1], 'FaceColor','flat','EdgeColor','none');
b2.CData = [acc3; acc4; acc1];
set(ax4,'XTick',1:3,'XTickLabel',{'Precision','Recall','F1'},'YLim',[0 115]);
for i=1:3
    vals = [prec rec f1];
    text(i, vals(i)+2, sprintf('%.1f%%', vals(i)), ...
         'HorizontalAlignment','center','FontSize',10,'Color',fg,'FontWeight','bold');
end
title('Skill Trigger Quality','Color',fg,'FontWeight','bold');
ylabel('%','Color',fg); grid on;

%% ── 5. RAG — per-query NDCG bar ─────────────────────────────────────────────
ax5 = subplot(3,4,[7 8]);
set(ax5,'Color',bg,'XColor',fg,'YColor',fg); hold on;

rag_results = data.rag.results;
n_rag       = numel(rag_results);
ndcg_vals   = arrayfun(@(r) r.ndcg, rag_results) * 100;
latencies   = arrayfun(@(r) r.latency_ms, rag_results);
queries     = arrayfun(@(r) r.query(1:min(30,end)), rag_results, 'UniformOutput',false);

bar_h = bar(ndcg_vals,'FaceColor',acc4,'EdgeColor','none','BarWidth',0.7);
yline(data.rag.mean_ndcg*100,'--','Color',acc2,'LineWidth',1.5,'Label','Mean NDCG');
set(ax5,'XTick',1:n_rag,'XTickLabel',queries,'XTickLabelRotation',25,'YLim',[0 115]);
ylabel('NDCG@3 (%)','Color',fg);
title(sprintf('RAG Retrieval NDCG@3 per Query  (Mean=%.1f%%  MRR=%.1f%%  Hit@1=%.1f%%)', ...
      data.rag.mean_ndcg*100, data.rag.mean_mrr*100, data.rag.hit_at_1*100), ...
      'Color',fg,'FontWeight','bold');
grid on;

%% ── 6. RAG latency distribution ─────────────────────────────────────────────
ax6 = subplot(3,4,9);
set(ax6,'Color',bg,'XColor',fg,'YColor',fg); hold on;

histogram(latencies,'FaceColor',acc1,'EdgeColor','none','NumBins',6);
xline(mean(latencies),'--','Color',acc2,'LineWidth',2,'Label',sprintf('Mean %.0fms',mean(latencies)));
xlabel('Latency (ms)','Color',fg);
ylabel('Count','Color',fg);
title('RAG Query Latency','Color',fg,'FontWeight','bold');
grid on;

%% ── 7. Sentinel confusion matrix ────────────────────────────────────────────
ax7 = subplot(3,4,[10 11]);
set(ax7,'Color',bg,'XColor',fg,'YColor',fg);

cls_order  = {'CLEAN','CRITICAL','HIGH','MEDIUM'};
n_cls      = numel(cls_order);
cm         = zeros(n_cls);
for i = 1:n_cls
    for j = 1:n_cls
        try
            cm(i,j) = data.sentinel.confusion.(cls_order{i}).(cls_order{j});
        catch
            cm(i,j) = 0;
        end
    end
end

imagesc(cm);
colormap(ax7, [linspace(bg(1),acc3(1),64)' linspace(bg(2),acc3(2),64)' linspace(bg(3),acc3(3),64)']);
colorbar('Color',fg);
set(ax7,'XTick',1:n_cls,'XTickLabel',cls_order,'YTick',1:n_cls,'YTickLabel',cls_order);
xlabel('Predicted','Color',fg); ylabel('Actual','Color',fg);
title('Sentinel Confusion Matrix','Color',fg,'FontWeight','bold');
for i=1:n_cls
    for j=1:n_cls
        text(j,i,num2str(cm(i,j)),'HorizontalAlignment','center','Color',fg,'FontSize',12,'FontWeight','bold');
    end
end

%% ── 8. Summary table (bottom-right) ─────────────────────────────────────────
ax8 = subplot(3,4,12);
set(ax8,'Color',bg,'XColor',bg,'YColor',bg,'XTick',[],'YTick',[]); hold on;

lines = {
    sprintf('Routing accuracy:  %.1f%%', data.routing.accuracy*100),
    sprintf('Skills precision:  %.1f%%', data.skills.precision*100),
    sprintf('Skills recall:     %.1f%%', data.skills.recall*100),
    sprintf('Skills F1:         %.1f%%', data.skills.f1*100),
    sprintf('RAG NDCG@3:        %.1f%%', data.rag.mean_ndcg*100),
    sprintf('RAG MRR:           %.1f%%', data.rag.mean_mrr*100),
    sprintf('RAG Hit@1:         %.1f%%', data.rag.hit_at_1*100),
    sprintf('RAG Hit@3:         %.1f%%', data.rag.hit_at_3*100),
    sprintf('RAG latency:       %.0f ms', data.rag.mean_latency),
    sprintf('Sentinel acc:      %.1f%%', data.sentinel.accuracy*100),
    '',
    sprintf('OVERALL:           %.1f%%', data.overall*100),
};

for i = 1:numel(lines)
    c = fg;
    fs = 9;
    if i == numel(lines), c = acc3; fs = 12; end
    text(0.05, 1 - i*0.075, lines{i}, 'Units','normalized', ...
         'Color',c,'FontSize',fs,'FontName','Courier','FontWeight', ...
         conditional(i==numel(lines),'bold','normal'));
end
title('Summary','Color',fg,'FontWeight','bold');
xlim([0 1]); ylim([0 1]); axis off;

%% ── Save figure ──────────────────────────────────────────────────────────────
out_path = fullfile(fileparts(mfilename('fullpath')), 'benchmark_dashboard.png');
exportgraphics(fig, out_path, 'Resolution', 150);
fprintf('Dashboard saved → benchmark/benchmark_dashboard.png\n\n');

%% ── Print summary to console ─────────────────────────────────────────────────
fprintf('Component          Score\n');
fprintf('─────────────────  ──────\n');
fprintf('Routing accuracy   %.1f%%\n', data.routing.accuracy*100);
fprintf('Skills F1          %.1f%%\n', data.skills.f1*100);
fprintf('RAG NDCG@3         %.1f%%\n', data.rag.mean_ndcg*100);
fprintf('Sentinel accuracy  %.1f%%\n', data.sentinel.accuracy*100);
fprintf('─────────────────  ──────\n');
fprintf('Overall            %.1f%%\n', data.overall*100);

%% Helper
function r = conditional(cond, a, b)
    if cond, r = a; else, r = b; end
end
